from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models import Company, Customer, Invoice, Product, utcnow
from app.schemas import InvoiceDocument, InvoiceLine, InvoiceRead, InvoiceSummary, Party, ProductQty
from app.services.invoice_calc import compute_totals

INVOICE_NUMBER_DIGITS = 3


def get_company(session: Session) -> Company:
    company = session.exec(select(Company)).first()
    if company is None:
        company = Company(name="My Company")
        session.add(company)
        session.commit()
        session.refresh(company)
    return company


def format_invoice_number(company: Company) -> str:
    return f"{company.invoice_prefix}{company.next_invoice_number:0{INVOICE_NUMBER_DIGITS}d}"


def line_from_product(product: Product, qty: int) -> InvoiceLine:
    return InvoiceLine(
        product_id=product.id,
        code=product.code,
        name=product.name,
        material=product.material,
        origin=product.origin,
        weight_g=product.weight_g,
        unit_price=product.unit_price,
        category=product.category,
        tariff_code=product.tariff_code,
        qty=qty,
    )


def lines_from_selection(session: Session, items: list[ProductQty]) -> list[InvoiceLine]:
    products = {p.id: p for p in session.exec(select(Product).where(Product.id.in_([i.product_id for i in items])))}
    missing = [item.product_id for item in items if item.product_id not in products]
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Products not found: {missing}")
    return [line_from_product(products[item.product_id], item.qty) for item in items]


def party_from(source: Company | Customer | None) -> Party:
    if source is None:
        return Party()
    return Party(name=source.name, address=source.address, phone=source.phone, fax=source.fax)


def to_document(invoice: Invoice) -> InvoiceDocument:
    return InvoiceDocument.model_validate(invoice, from_attributes=True)


def to_read(invoice: Invoice) -> InvoiceRead:
    doc = to_document(invoice)
    return InvoiceRead(
        **doc.model_dump(),
        id=invoice.id,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        totals=compute_totals(doc),
    )


def to_summary(invoice: Invoice) -> InvoiceSummary:
    doc = to_document(invoice)
    return InvoiceSummary(
        id=invoice.id,
        number=invoice.number,
        invoice_date=invoice.invoice_date,
        addressee_name=doc.addressee.name,
        line_count=len(doc.lines),
        totals=compute_totals(doc),
        updated_at=invoice.updated_at,
    )


def ensure_unique_number(session: Session, number: str, exclude_id: int | None = None) -> None:
    existing = session.exec(select(Invoice).where(Invoice.number == number)).first()
    if existing is not None and existing.id != exclude_id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Invoice number {number} already exists")


def apply_document(invoice: Invoice, doc: InvoiceDocument) -> None:
    data = doc.model_dump(mode="json")
    invoice.number = doc.number
    invoice.invoice_date = doc.invoice_date
    invoice.place = doc.place
    invoice.shipped_per = doc.shipped_per
    invoice.payment_terms = doc.payment_terms
    invoice.commercial_value = doc.commercial_value
    invoice.remarks = doc.remarks
    invoice.pieces_override = doc.pieces_override
    invoice.gross_weight_override_kg = doc.gross_weight_override_kg
    invoice.customer_id = doc.customer_id
    invoice.sender = data["sender"]
    invoice.addressee = data["addressee"]
    invoice.lines = data["lines"]
    invoice.boxes = data["boxes"]
    invoice.updated_at = utcnow()


def create_invoice(
    session: Session,
    lines: list[InvoiceLine],
    customer: Customer | None,
    invoice_date: date | None = None,
    number: str | None = None,
) -> Invoice:
    company = get_company(session)
    auto_number = number is None or number.strip() == format_invoice_number(company)
    number = format_invoice_number(company) if number is None or not number.strip() else number.strip()
    ensure_unique_number(session, number)
    doc = InvoiceDocument(
        number=number,
        invoice_date=invoice_date or date.today(),
        place=company.place,
        shipped_per=company.shipped_per,
        payment_terms=company.payment_terms,
        customer_id=customer.id if customer else None,
        sender=party_from(company),
        addressee=party_from(customer),
        lines=lines,
    )
    invoice = Invoice(number=number, invoice_date=doc.invoice_date)
    apply_document(invoice, doc)
    if auto_number:
        company.next_invoice_number += 1
        session.add(company)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice
