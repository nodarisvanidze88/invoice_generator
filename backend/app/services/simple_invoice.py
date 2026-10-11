"""Simplified invoice: one row per 'Category [Tariff]' with weight, quantity, average unit price and total."""

from dataclasses import dataclass

from app.schemas import InvoiceDocument, Party
from app.services.invoice_calc import group_lines


@dataclass(frozen=True)
class CategoryRow:
    label: str
    net_weight_kg: float
    qty: int
    amount: float

    @property
    def unit_price(self) -> float:
        return self.amount / self.qty if self.qty else 0.0


@dataclass(frozen=True)
class SimpleInvoice:
    number: str
    invoice_date_label: str
    company_name: str
    company_address: str
    company_phone: str
    shipping_to: Party
    bill_to: Party
    rows: list[CategoryRow]
    currency_code: str

    @property
    def total_weight_kg(self) -> float:
        return sum(row.net_weight_kg for row in self.rows)

    @property
    def total_qty(self) -> int:
        return sum(row.qty for row in self.rows)

    @property
    def total_amount(self) -> float:
        return sum(row.amount for row in self.rows)


def one_line_address(address: str) -> str:
    return ", ".join(part.strip() for part in address.splitlines() if part.strip())


def build_simple_invoice(doc: InvoiceDocument, currency_code: str) -> SimpleInvoice:
    rows = [
        CategoryRow(label=group.label, net_weight_kg=group.net_weight_kg, qty=group.qty, amount=group.amount)
        for group in group_lines(doc.lines)
    ]
    return SimpleInvoice(
        number=doc.number,
        invoice_date_label=doc.invoice_date.strftime("%d-%b-%Y"),
        company_name=doc.sender.name,
        company_address=one_line_address(doc.sender.address),
        company_phone=doc.sender.phone,
        shipping_to=doc.addressee,
        bill_to=doc.bill_to if doc.bill_to and doc.bill_to.name.strip() else doc.addressee,
        rows=rows,
        currency_code=currency_code,
    )


def currency_code_from_label(label: str) -> str:
    code = "".join(ch for ch in label if ch.isascii() and ch.isalpha())[:3].upper()
    return code or "JPY"
