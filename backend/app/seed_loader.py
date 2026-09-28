import json
import logging
from datetime import date
from typing import Any

from sqlmodel import Session, select

from app.config import SEED_FILE
from app.models import Company, Customer, Product
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
