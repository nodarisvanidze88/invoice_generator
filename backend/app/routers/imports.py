from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Product, utcnow
from app.schemas import ImportApply, ImportPreview, ImportResult, ImportRow, ProductQty
from app.services.csv_import import CsvImportError, build_code_index, parse_csv

router = APIRouter(prefix="/api/imports", tags=["imports"])
SessionDep = Annotated[Session, Depends(get_session)]
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
PRODUCT_FIELDS = ("code", "name", "material", "origin", "weight_g", "unit_price", "category", "tariff_code")


@router.post("/csv/preview", response_model=ImportPreview)
async def preview_csv(file: UploadFile, session: SessionDep) -> ImportPreview:
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 5 MB")
    try:
        parsed, encoding = parse_csv(content)
    except CsvImportError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    index = build_code_index(session.exec(select(Product)))
    rows: list[ImportRow] = []
    for item in parsed:
        product = index.get(item.code)
        rows.append(
            ImportRow(
                row=item.row,
                code=item.code,
                csv_name=item.name,
                qty=item.qty,
                csv_unit_price=item.unit_price,
                product_id=product.id if product else None,
                status="matched" if product else "new",
                current={field: getattr(product, field) for field in PRODUCT_FIELDS} if product else None,
            )
        )
    matched = sum(1 for row in rows if row.product_id)
    return ImportPreview(
        filename=file.filename or "upload.csv",
        encoding=encoding,
        rows=rows,
        matched_count=matched,
        new_count=len(rows) - matched,
    )


@router.post("/csv/apply", response_model=ImportResult)
def apply_csv(body: ImportApply, session: SessionDep) -> ImportResult:
    created = updated = 0
    touched: list[tuple[Product, int | None]] = []
    for row in body.rows:
        values = row.model_dump(include=set(PRODUCT_FIELDS))
        if row.product_id is not None:
            product = session.get(Product, row.product_id)
            if product is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {row.product_id} not found")
            if not body.update_prices:
                values.pop("unit_price")
            values.pop("code")
            product.sqlmodel_update(values)
            product.updated_at = utcnow()
            updated += 1
        else:
            product = Product(**values)
            created += 1
        session.add(product)
        touched.append((product, row.qty))
    session.commit()
    selection = []
    for product, qty in touched:
        session.refresh(product)
        if qty and qty > 0:
            selection.append(ProductQty(product_id=product.id, qty=qty))
    return ImportResult(created=created, updated=updated, selection=selection)
