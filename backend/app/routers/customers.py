from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Customer, PartyFields

router = APIRouter(prefix="/api/customers", tags=["customers"])
SessionDep = Annotated[Session, Depends(get_session)]


def _get_or_404(session: Session, customer_id: int) -> Customer:
    customer = session.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return customer


@router.get("", response_model=list[Customer])
def list_customers(session: SessionDep) -> list[Customer]:
    return list(session.exec(select(Customer).order_by(Customer.name)))


@router.post("", response_model=Customer, status_code=status.HTTP_201_CREATED)
def create_customer(body: PartyFields, session: SessionDep) -> Customer:
    customer = Customer.model_validate(body)
    session.add(customer)
    session.commit()
    session.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=Customer)
def update_customer(customer_id: int, body: PartyFields, session: SessionDep) -> Customer:
    customer = _get_or_404(session, customer_id)
    customer.sqlmodel_update(body.model_dump())
    session.add(customer)
    session.commit()
    session.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, session: SessionDep) -> None:
    session.delete(_get_or_404(session, customer_id))
    session.commit()
