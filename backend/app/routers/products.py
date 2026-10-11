from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field, ValidationError
from sqlmodel import Session, col, delete, select

from app.db import get_session
from app.models import Product, ProductFields, utcnow
from app.schemas import BulkIds
from app.services.excel_export import import_template_xlsx, products_to_xlsx
from app.services.product_import import AnalyzedRow, ImportMode, ProductImportError, analyze, apply_import
from app.services.sheet_layout import FIELD_ORDER, LayoutError, SheetLayout, inspect_workbook

router = APIRouter(prefix="/api/products", tags=["products"])
SessionDep = Annotated[Session, Depends(get_session)]
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_IMPORT_BYTES = 10 * 1024 * 1024


def _get_or_404(session: Session, product_id: int) -> Product:
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product


@router.get("", response_model=list[Product])
def list_products(session: SessionDep) -> list[Product]:
    return list(session.exec(select(Product).order_by(col(Product.id).desc())))


@router.get("/export.xlsx")
def export_products(session: SessionDep) -> Response:
    products = list(session.exec(select(Product).order_by(Product.category, Product.name)))
    return Response(
        products_to_xlsx(products),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="products.xlsx"'},
    )


@router.post("", response_model=Product, status_code=status.HTTP_201_CREATED)
def create_product(body: ProductFields, session: SessionDep) -> Product:
    product = Product.model_validate(body)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.put("/{product_id}", response_model=Product)
def update_product(product_id: int, body: ProductFields, session: SessionDep) -> Product:
    product = _get_or_404(session, product_id)
    product.sqlmodel_update(body.model_dump())
    product.updated_at = utcnow()
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, session: SessionDep) -> None:
    session.delete(_get_or_404(session, product_id))
    session.commit()


@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete(body: BulkIds, session: SessionDep) -> None:
    session.exec(delete(Product).where(col(Product.id).in_(body.ids)))
    session.commit()


class ImportChange(BaseModel):
    field: str
    label: str
    current: Any
    incoming: Any


class ImportPreviewRow(BaseModel):
    row: int
    status: str
    code: str
    name: str
    category: str = ""
    unit_price: float | None = None
    product_id: int | None = None
    product_code: str = ""
    product_name: str = ""
    changes: list[ImportChange] = []
    message: str = ""


class ProductImportPreview(BaseModel):
    new: list[ImportPreviewRow]
    existing: list[ImportPreviewRow]
    problems: list[ImportPreviewRow]


class ImportColumn(BaseModel):
    index: int
    letter: str
    header: str
    samples: list[str]


class ImportSheet(BaseModel):
    name: str
    recognized: int
    header_row: int
    recommended: bool


class ImportLayout(BaseModel):
    sheet: str
    header_row: int = Field(ge=1)
    mapping: dict[str, int]
    weight_in_kg: bool = False


class ImportInspection(BaseModel):
    sheets: list[ImportSheet]
    layout: ImportLayout
    columns: list[ImportColumn]
    data_rows: int
    unmapped_headers: list[str]


class ProductImportSummary(BaseModel):
    created: int
    updated: int
    unchanged: int
    skipped_existing: int
    skipped_invalid: int


async def _read_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 10 MB")
    return content


def _parse_layout(raw: str | None) -> SheetLayout | None:
    if not raw:
        return None
    try:
        layout = ImportLayout.model_validate_json(raw)
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid column mapping") from exc
    unknown = set(layout.mapping) - set(FIELD_ORDER)
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown fields in mapping: {', '.join(sorted(unknown))}")
    return SheetLayout(sheet=layout.sheet, header_row=layout.header_row, mapping=layout.mapping, weight_in_kg=layout.weight_in_kg)


async def _analyze_upload(file: UploadFile, session: Session, layout: str | None) -> list[AnalyzedRow]:
    content = await _read_upload(file)
    try:
        return analyze(session, content, _parse_layout(layout))
    except ProductImportError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


def _preview_row(row: AnalyzedRow) -> ImportPreviewRow:
    return ImportPreviewRow(
        row=row.row,
        status=row.status,
        code=str(row.values.get("code", "")),
        name=str(row.values.get("name", "")),
        category=str(row.values.get("category", "")),
        unit_price=row.values.get("unit_price"),
        product_id=row.product.id if row.product else None,
        product_code=row.product.code if row.product else "",
        product_name=row.product.name if row.product else "",
        changes=[ImportChange(field=c.field, label=c.label, current=c.current, incoming=c.incoming) for c in row.changes],
        message=row.message,
    )


@router.get("/import-template.xlsx")
def import_template() -> Response:
    return Response(
        import_template_xlsx(),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="products-import-template.xlsx"'},
    )


@router.post("/import.xlsx/inspect", response_model=ImportInspection)
async def inspect_products_xlsx(
    file: UploadFile, sheet: Annotated[str | None, Form()] = None, header_row: Annotated[int | None, Form(ge=1)] = None
) -> ImportInspection:
    content = await _read_upload(file)
    try:
        result = inspect_workbook(content, sheet, header_row)
    except LayoutError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    recommended = max(result.sheets, key=lambda s: s.score).name
    return ImportInspection(
        sheets=[ImportSheet(name=s.name, recognized=s.recognized, header_row=s.header_row, recommended=s.name == recommended) for s in result.sheets],
        layout=ImportLayout(
            sheet=result.layout.sheet,
            header_row=result.layout.header_row,
            mapping=result.layout.mapping,
            weight_in_kg=result.layout.weight_in_kg,
        ),
        columns=[ImportColumn(index=c.index, letter=c.letter, header=c.header, samples=c.samples) for c in result.columns],
        data_rows=result.data_rows,
        unmapped_headers=result.unmapped_headers,
    )


@router.post("/import.xlsx/preview", response_model=ProductImportPreview)
async def preview_products_xlsx(file: UploadFile, session: SessionDep, layout: Annotated[str | None, Form()] = None) -> ProductImportPreview:
    rows = [_preview_row(row) for row in await _analyze_upload(file, session, layout)]
    return ProductImportPreview(
        new=[r for r in rows if r.status == "new"],
        existing=[r for r in rows if r.status == "existing"],
        problems=[r for r in rows if r.status in ("invalid", "duplicate")],
    )


@router.post("/import.xlsx", response_model=ProductImportSummary)
async def import_products_xlsx(
    file: UploadFile, session: SessionDep, mode: ImportMode = ImportMode.NEW_ONLY, layout: Annotated[str | None, Form()] = None
) -> ProductImportSummary:
    result = apply_import(session, await _analyze_upload(file, session, layout), mode)
    return ProductImportSummary(
        created=result.created,
        updated=result.updated,
        unchanged=result.unchanged,
        skipped_existing=result.skipped_existing,
        skipped_invalid=result.skipped_invalid,
    )
