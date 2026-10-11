import json
import logging
from datetime import date
from typing import Any

from sqlmodel import Session, select

from app.config import SEED_FILE
from app.models import BoxType, Company, Customer, Product
from app.schemas import Box, BoxItem
from app.services.invoices import apply_document, create_invoice, line_from_product, to_document

logger = logging.getLogger(__name__)


def seed_database(session: Session) -> bool:
    if session.exec(select(Company)).first() is not None:
        return False
    payload: dict[str, Any] = json.loads(SEED_FILE.read_text(encoding="utf-8"))

    sample = payload["sample_invoice"]
    company_data = dict(payload["company"])
    company = Company(**company_data)
    customer = Customer(**payload["customer"])
    products = [Product(**item) for item in payload["products"]]
    session.add_all([company, customer, *products])
    session.commit()
    for product in products:
        session.refresh(product)
    session.refresh(customer)

    lines = [line_from_product(products[line["product_index"]], line["qty"]) for line in sample["lines"]]
    line_id_by_index = {line["product_index"]: invoice_line.id for line, invoice_line in zip(sample["lines"], lines)}
    invoice = create_invoice(session, lines, customer, date.fromisoformat(sample["invoice_date"]), sample["number"])

    doc = to_document(invoice)
    doc.boxes = [
        Box(
            length_cm=box["length_cm"],
            width_cm=box["width_cm"],
            height_cm=box["height_cm"],
            gross_weight_kg=box["gross_weight_kg"],
            items=[BoxItem(line_id=line_id_by_index[item["product_index"]], qty=item["qty"]) for item in box["items"]],
        )
        for box in sample["boxes"]
    ]
    apply_document(invoice, doc)
    session.add(invoice)
    session.commit()
    logger.info("Seeded %d products and sample invoice %s", len(products), invoice.number)
    return True


DEFAULT_BOX_TYPES: tuple[dict[str, Any], ...] = (
    {"name": "Large 64×43×52", "length_cm": 64, "width_cm": 43, "height_cm": 52, "tare_weight_kg": 1.5, "max_weight_kg": 30},
    {"name": "Medium 48×39×26", "length_cm": 48, "width_cm": 39, "height_cm": 26, "tare_weight_kg": 0.9, "max_weight_kg": 25},
    {"name": "Small 40×30×25", "length_cm": 40, "width_cm": 30, "height_cm": 25, "tare_weight_kg": 0.6, "max_weight_kg": 20},
)


def ensure_box_types(session: Session) -> None:
    if session.exec(select(BoxType)).first() is not None:
        return
    session.add_all([BoxType(**fields) for fields in DEFAULT_BOX_TYPES])
    session.commit()
    logger.info("Seeded %d default box types", len(DEFAULT_BOX_TYPES))
