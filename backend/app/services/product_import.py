"""Product import from any Excel layout (sheet, header row and columns are detected or chosen by the user).

Every row is first classified against the catalogue — matched by ID, then by JAN (also inside "A / B" multi-codes),
then by name when the row has no code — so the user can review what is new and what is already registered before
choosing to add new products only or to also update the registered ones.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Literal

from pydantic import ValidationError
from sqlmodel import Session, select

from app.models import Product, ProductFields, utcnow
from app.services.csv_import import build_code_index
from app.services.excel_export import COLUMNS
from app.services.sheet_layout import LayoutError, SheetLayout, inspect_workbook, read_table

NUMERIC_FIELDS = {"weight_g", "unit_price", "length_cm", "width_cm", "height_cm"}
BOOLEAN_FIELDS = {"keep_upright"}
TRUE_WORDS = {"yes", "y", "true", "1", "x", "✓"}
FIELD_LABELS = {attr: title for title, attr, _ in COLUMNS}
NUMERIC_TOLERANCE = 1e-9

RowStatus = Literal["new", "existing", "duplicate", "invalid"]


class ProductImportError(ValueError):
    pass


class ImportMode(StrEnum):
    NEW_ONLY = "new_only"
    UPSERT = "upsert"


@dataclass(frozen=True)
class FieldChange:
    field: str
    label: str
    current: Any
    incoming: Any


@dataclass
class AnalyzedRow:
    row: int
    status: RowStatus
    values: dict[str, Any] = field(default_factory=dict)
    product: Product | None = None
    changes: list[FieldChange] = field(default_factory=list)
    message: str = ""


@dataclass
class ProductImportResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped_existing: int = 0
    skipped_invalid: int = 0


def _clean(attr: str, value: Any) -> Any:
    if attr in BOOLEAN_FIELDS:
        return str(value).strip().lower() in TRUE_WORDS if value is not None else False
    if attr in NUMERIC_FIELDS:
        if value in (None, ""):
            return None
        try:
            return float(str(value).replace(",", "").strip())
        except ValueError as exc:
            raise ValueError(f"{FIELD_LABELS[attr]} must be a number") from exc
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def _differs(current: Any, incoming: Any) -> bool:
    if isinstance(current, (int, float)) and isinstance(incoming, (int, float)) and not isinstance(current, bool):
        return abs(current - incoming) > NUMERIC_TOLERANCE
    return current != incoming


def _validation_message(exc: ValueError | ValidationError) -> str:
    if isinstance(exc, ValidationError):
        error = exc.errors()[0]
        location = FIELD_LABELS.get(str(error["loc"][0]), str(error["loc"][0])) if error["loc"] else ""
        return f"{location}: {error['msg']}" if location else error["msg"]
    return str(exc)


class _Matcher:
    def __init__(self, products: list[Product]) -> None:
        self.by_id = {p.id: p for p in products}
        self.by_exact_code: dict[str, Product] = {}
        for product in products:
            self.by_exact_code.setdefault(product.code.strip(), product)
        self.by_code_token = build_code_index(products)
        self.by_name = {p.name.strip().lower(): p for p in products if not p.code.strip()}

    def find(self, raw_id: Any, values: dict[str, Any]) -> Product | None:
        if raw_id not in (None, ""):
            try:
                product = self.by_id.get(int(float(raw_id)))
            except ValueError:
                product = None
            if product is not None:
                return product
        code = str(values.get("code", "")).strip()
        if code:
            if code in self.by_exact_code:
                return self.by_exact_code[code]
            tokens = [token.strip() for token in code.split("/") if token.strip()]
            for index in (self.by_exact_code, self.by_code_token):
                for token in tokens:
                    if token in index:
                        return index[token]
            return None
        return self.by_name.get(str(values.get("name", "")).strip().lower())


def analyze(session: Session, content: bytes, layout: SheetLayout | None = None) -> list[AnalyzedRow]:
    try:
        layout = layout or inspect_workbook(content).layout
        rows = read_table(content, layout)
    except LayoutError as exc:
        raise ProductImportError(str(exc)) from exc
    matcher = _Matcher(list(session.exec(select(Product))))
    seen: dict[str, int] = {}
    analyzed: list[AnalyzedRow] = []

    for number, raw in rows:
        try:
            values = {attr: _clean(attr, value) for attr, value in raw.items() if attr != "id"}
        except ValueError as exc:
            analyzed.append(AnalyzedRow(row=number, status="invalid", message=str(exc)))
            continue
        raw_id = raw.get("id")
        product = matcher.find(raw_id, values)
        key = f"id:{product.id}" if product else f"code:{values.get('code', '')}".lower() if values.get("code") else f"name:{values.get('name', '')}".lower()
        if key in seen:
            analyzed.append(AnalyzedRow(row=number, status="duplicate", values=values, product=product, message=f"Same product as row {seen[key]}"))
            continue
        seen[key] = number

        try:
            if product is None:
                validated = ProductFields.model_validate(values).model_dump()
                analyzed.append(AnalyzedRow(row=number, status="new", values=validated))
                continue
            current = product.model_dump(include=set(ProductFields.model_fields))
            merged = ProductFields.model_validate(current | values).model_dump()
        except (ValueError, ValidationError) as exc:
            message = _validation_message(exc)
            if product is not None and not str((current | values).get("name", "")).strip():
                message = f"Matches registered product ID {product.id}, which has no name — fill in Product Name to fix it"
            analyzed.append(AnalyzedRow(row=number, status="invalid", values=values, product=product, message=message))
            continue
        changes = [
            FieldChange(name, FIELD_LABELS.get(name, name), current[name], merged[name])
            for name in ProductFields.model_fields
            if _differs(current[name], merged[name])
        ]
        analyzed.append(AnalyzedRow(row=number, status="existing", values=merged, product=product, changes=changes))
    return analyzed


def apply_import(session: Session, rows: list[AnalyzedRow], mode: ImportMode) -> ProductImportResult:
    result = ProductImportResult()
    for row in rows:
        if row.status == "new":
            session.add(Product.model_validate(row.values))
            result.created += 1
        elif row.status == "existing" and row.product is not None:
            if mode is ImportMode.NEW_ONLY:
                result.skipped_existing += 1
            elif not row.changes:
                result.unchanged += 1
            else:
                row.product.sqlmodel_update(row.values)
                row.product.updated_at = utcnow()
                session.add(row.product)
                result.updated += 1
        else:
            result.skipped_invalid += 1
    session.commit()
    return result
