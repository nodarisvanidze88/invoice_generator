from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, col, delete, select

from app.db import get_session
from app.models import Product, ProductFields, utcnow
from app.schemas import BulkIds
from app.services.excel_export import products_to_xlsx

router = APIRouter(prefix="/api/products", tags=["products"])
SessionDep = Annotated[Session, Depends(get_session)]
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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
