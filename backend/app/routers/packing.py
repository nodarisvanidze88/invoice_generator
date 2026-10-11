from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import BoxType, BoxTypeFields, Product
from app.schemas import Box, InvoiceLine
from app.services.invoices import get_company
from app.services.packing import BoxSpec, auto_pack, category_densities, to_box

router = APIRouter(prefix="/api", tags=["packing"])
SessionDep = Annotated[Session, Depends(get_session)]


class AutoPackRequest(BaseModel):
    lines: list[InvoiceLine]
    box_type_ids: list[int] | None = None


class UnpackedLine(BaseModel):
    line_id: str
    qty: int
    reason: str


class AutoPackResult(BaseModel):
    boxes: list[Box]
    unpacked: list[UnpackedLine]
    estimated_line_ids: list[str]
    volumetric_divisor: int = Field(ge=1)


def _get_or_404(session: Session, box_type_id: int) -> BoxType:
    box_type = session.get(BoxType, box_type_id)
    if box_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Box type not found")
    return box_type


@router.get("/box-types", response_model=list[BoxType])
def list_box_types(session: SessionDep) -> list[BoxType]:
    box_types = session.exec(select(BoxType))
    return sorted(box_types, key=lambda bt: bt.length_cm * bt.width_cm * bt.height_cm, reverse=True)


@router.post("/box-types", response_model=BoxType, status_code=status.HTTP_201_CREATED)
def create_box_type(body: BoxTypeFields, session: SessionDep) -> BoxType:
    box_type = BoxType.model_validate(body)
    session.add(box_type)
    session.commit()
    session.refresh(box_type)
    return box_type


@router.put("/box-types/{box_type_id}", response_model=BoxType)
def update_box_type(box_type_id: int, body: BoxTypeFields, session: SessionDep) -> BoxType:
    box_type = _get_or_404(session, box_type_id)
    box_type.sqlmodel_update(body.model_dump())
    session.add(box_type)
    session.commit()
    session.refresh(box_type)
    return box_type


@router.delete("/box-types/{box_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_box_type(box_type_id: int, session: SessionDep) -> None:
    session.delete(_get_or_404(session, box_type_id))
    session.commit()


@router.post("/packing/auto", response_model=AutoPackResult)
def run_auto_pack(body: AutoPackRequest, session: SessionDep) -> AutoPackResult:
    query = select(BoxType).where(BoxType.active == True)  # noqa: E712
    if body.box_type_ids:
        query = select(BoxType).where(col(BoxType.id).in_(body.box_type_ids))
    box_types = list(session.exec(query))
    if not box_types:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add at least one box type first")

    specs = [
        BoxSpec(bt.id, bt.name, (bt.length_cm, bt.width_cm, bt.height_cm), bt.tare_weight_kg, bt.max_weight_kg)
        for bt in box_types
    ]
    products = session.exec(select(Product.category, Product.weight_g, Product.length_cm, Product.width_cm, Product.height_cm))
    divisor = get_company(session).volumetric_divisor
    result = auto_pack(body.lines, specs, divisor, category_densities(products))
    return AutoPackResult(
        boxes=[to_box(state) for state in result.boxes],
        unpacked=[UnpackedLine(line_id=u.line_id, qty=u.qty, reason=u.reason) for u in result.unpacked],
        estimated_line_ids=result.estimated_line_ids,
        volumetric_divisor=divisor,
    )
