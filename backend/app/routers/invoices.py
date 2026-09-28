from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import Customer, Invoice
from app.pdf.invoice_pdf import render_invoice_pdf
from app.pdf.packing_pdf import render_packing_pdf
from app.schemas import InvoiceCreate, InvoiceDocument, InvoiceLine, InvoiceRead, InvoiceSummary, NextNumber
from app.services.invoices import (
    apply_document,
    create_invoice,
    ensure_unique_number,
    format_invoice_number,
    get_company,
    lines_from_selection,
    to_document,
    to_read,
    to_summary,
)

router = APIRouter(prefix="/api/invoices", tags=["invoices"])
SessionDep = Annotated[Session, Depends(get_session)]


def _get_or_404(session: Session, invoice_id: int) -> Invoice:
    invoice = session.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return invoice


def _pdf_response(content: bytes, filename: str, download: bool) -> Response:
    disposition = "attachment" if download else "inline"
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("", response_model=list[InvoiceSummary])
def list_invoices(session: SessionDep) -> list[InvoiceSummary]:
    invoices = session.exec(select(Invoice).order_by(col(Invoice.created_at).desc()))
    return [to_summary(invoice) for invoice in invoices]


@router.get("/next-number", response_model=NextNumber)
def next_number(session: SessionDep) -> NextNumber:
    return NextNumber(number=format_invoice_number(get_company(session)))


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create(body: InvoiceCreate, session: SessionDep) -> InvoiceRead:
    customer = session.get(Customer, body.customer_id) if body.customer_id else None
    if body.customer_id and customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    lines = lines_from_selection(session, body.items)
    return to_read(create_invoice(session, lines, customer, body.invoice_date, body.number))


@router.get("/{invoice_id}", response_model=InvoiceRead)
def read(invoice_id: int, session: SessionDep) -> InvoiceRead:
    return to_read(_get_or_404(session, invoice_id))


@router.put("/{invoice_id}", response_model=InvoiceRead)
def update(invoice_id: int, body: InvoiceDocument, session: SessionDep) -> InvoiceRead:
    invoice = _get_or_404(session, invoice_id)
    ensure_unique_number(session, body.number, exclude_id=invoice.id)
    apply_document(invoice, body)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return to_read(invoice)


@router.post("/{invoice_id}/duplicate", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def duplicate(invoice_id: int, session: SessionDep) -> InvoiceRead:
    source = to_document(_get_or_404(session, invoice_id))
    customer = session.get(Customer, source.customer_id) if source.customer_id else None
    lines = [InvoiceLine(**line.model_dump(exclude={"id"})) for line in source.lines]
    invoice = create_invoice(session, lines, customer)
    doc = to_document(invoice)
    doc.addressee = source.addressee
    doc.remarks = source.remarks
    doc.commercial_value = source.commercial_value
    apply_document(invoice, doc)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return to_read(invoice)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(invoice_id: int, session: SessionDep) -> None:
    session.delete(_get_or_404(session, invoice_id))
    session.commit()


@router.get("/{invoice_id}/invoice.pdf")
def invoice_pdf(invoice_id: int, session: SessionDep, download: bool = False) -> Response:
    invoice = _get_or_404(session, invoice_id)
    company = get_company(session)
    content = render_invoice_pdf(
        to_document(invoice), company.currency_label, company.currency_symbol, company.trade_term_label
    )
    return _pdf_response(content, f"Invoice {invoice.number} Date_{invoice.invoice_date:%d.%m.%Y}.pdf", download)


@router.get("/{invoice_id}/packing.pdf")
def packing_pdf(invoice_id: int, session: SessionDep, download: bool = False) -> Response:
    invoice = _get_or_404(session, invoice_id)
    content = render_packing_pdf(to_document(invoice))
    return _pdf_response(content, f"Packing List {invoice.number} Date_{invoice.invoice_date:%d.%m.%Y}.pdf", download)
