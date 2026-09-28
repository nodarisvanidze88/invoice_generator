from datetime import date, datetime
from typing import Self
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


def new_id() -> str:
    return uuid4().hex[:12]


class Party(BaseModel):
    name: str = ""
    address: str = ""
    phone: str = ""
    fax: str = ""


class InvoiceLine(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: int | None = None
    code: str = ""
    name: str
    material: str = ""
    origin: str = ""
    weight_g: float | None = Field(default=None, ge=0)
    unit_price: float | None = Field(default=None, ge=0)
    category: str = ""
    tariff_code: str = ""
    qty: int = Field(ge=0)


class BoxItem(BaseModel):
    line_id: str
    qty: int = Field(gt=0)


class Box(BaseModel):
    id: str = Field(default_factory=new_id)
    length_cm: float | None = Field(default=None, ge=0)
    width_cm: float | None = Field(default=None, ge=0)
    height_cm: float | None = Field(default=None, ge=0)
    gross_weight_kg: float | None = Field(default=None, ge=0)
    items: list[BoxItem] = Field(default_factory=list)


class InvoiceHeader(BaseModel):
    number: str = Field(min_length=1, max_length=50)
    invoice_date: date
    place: str = ""
    shipped_per: str = ""
    payment_terms: str = ""
    commercial_value: bool = True
    remarks: str = ""
    customer_id: int | None = None
    sender: Party = Field(default_factory=Party)
    addressee: Party = Field(default_factory=Party)


class InvoiceDocument(InvoiceHeader):
    lines: list[InvoiceLine] = Field(default_factory=list)
    boxes: list[Box] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_box_references(self) -> Self:
        line_ids = [line.id for line in self.lines]
        if len(line_ids) != len(set(line_ids)):
            raise ValueError("Invoice line ids must be unique")
        known = set(line_ids)
        for box in self.boxes:
            unknown = {item.line_id for item in box.items} - known
            if unknown:
                raise ValueError(f"Box references unknown lines: {', '.join(sorted(unknown))}")
        return self


class InvoiceTotals(BaseModel):
    net_weight_kg: float
    qty: int
    amount: float
    gross_weight_kg: float
    pieces: int
    origins: list[str]
    unpacked_qty: int
    mismatched_lines: int


class InvoiceRead(InvoiceDocument):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    totals: InvoiceTotals


class InvoiceSummary(BaseModel):
    id: int
    number: str
    invoice_date: date
    addressee_name: str
    line_count: int
    totals: InvoiceTotals
    updated_at: datetime


class ProductQty(BaseModel):
    product_id: int
    qty: int = Field(gt=0)


class InvoiceCreate(BaseModel):
    items: list[ProductQty] = Field(min_length=1)
    customer_id: int | None = None
    invoice_date: date | None = None
    number: str | None = Field(default=None, max_length=50)


class NextNumber(BaseModel):
    number: str


class BulkIds(BaseModel):
    ids: list[int] = Field(min_length=1)


class LoginRequest(BaseModel):
    password: str


class SessionInfo(BaseModel):
    authenticated: bool


class ImportRow(BaseModel):
    row: int
    code: str
    csv_name: str
    qty: int | None = None
    csv_unit_price: float | None = None
    product_id: int | None = None
    status: str
    current: dict[str, str | float | None] | None = None


class ImportPreview(BaseModel):
    filename: str
    encoding: str
    rows: list[ImportRow]
    new_count: int
    matched_count: int


class ImportApplyRow(BaseModel):
    code: str
    product_id: int | None = None
    name: str = Field(min_length=1)
    material: str = ""
    origin: str = ""
    weight_g: float | None = Field(default=None, ge=0)
    unit_price: float | None = Field(default=None, ge=0)
    category: str = ""
    tariff_code: str = ""
    qty: int | None = None


class ImportApply(BaseModel):
    rows: list[ImportApplyRow]
    update_prices: bool = True


class ImportResult(BaseModel):
    created: int
    updated: int
    selection: list[ProductQty]
