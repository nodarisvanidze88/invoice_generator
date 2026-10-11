from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.schemas import Party


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProductFields(SQLModel):
    code: str = Field(default="", max_length=300, index=True)
    name: str = Field(min_length=1, max_length=500)
    material: str = Field(default="", max_length=200)
    origin: str = Field(default="", max_length=100)
    weight_g: float | None = Field(default=None, ge=0)
    unit_price: float | None = Field(default=None, ge=0)
    category: str = Field(default="", max_length=200, index=True)
    tariff_code: str = Field(default="", max_length=50)
    length_cm: float | None = Field(default=None, ge=0)
    width_cm: float | None = Field(default=None, ge=0)
    height_cm: float | None = Field(default=None, ge=0)
    keep_upright: bool = False


class Product(ProductFields, table=True):
    id: int | None = Field(default=None, primary_key=True)
    updated_at: datetime = Field(default_factory=utcnow)


class PartyFields(SQLModel):
    name: str = Field(min_length=1, max_length=300)
    address: str = Field(default="", max_length=1000)
    phone: str = Field(default="", max_length=100)
    fax: str = Field(default="", max_length=100)


class CustomerFields(PartyFields):
    bill_to: Party | None = None


class Customer(PartyFields, table=True):
    id: int | None = Field(default=None, primary_key=True)
    bill_to: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    created_at: datetime = Field(default_factory=utcnow)


class CompanyFields(PartyFields):
    place: str = ""
    shipped_per: str = ""
    payment_terms: str = ""
    currency_label: str = "JPY日本円"
    currency_symbol: str = "¥"
    trade_term_label: str = "E.X.W.JAPAN"
    invoice_prefix: str = Field(default="INV", max_length=20)
    next_invoice_number: int = Field(default=1, ge=1)
    volumetric_divisor: int = Field(default=5000, ge=1)


class Company(CompanyFields, table=True):
    id: int | None = Field(default=None, primary_key=True)


class BoxTypeFields(SQLModel):
    name: str = Field(min_length=1, max_length=100)
    length_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    tare_weight_kg: float = Field(default=0, ge=0)
    max_weight_kg: float = Field(default=30, gt=0)
    active: bool = True


class BoxType(BoxTypeFields, table=True):
    __tablename__ = "box_type"

    id: int | None = Field(default=None, primary_key=True)


class Invoice(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    number: str = Field(index=True, unique=True)
    invoice_date: date
    place: str = ""
    shipped_per: str = ""
    payment_terms: str = ""
    commercial_value: bool = True
    remarks: str = ""
    pieces_override: int | None = None
    gross_weight_override_kg: float | None = None
    customer_id: int | None = Field(default=None, foreign_key="customer.id", ondelete="SET NULL")
    sender: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    addressee: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    bill_to: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    lines: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    boxes: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
