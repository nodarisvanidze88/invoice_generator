from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.models import Company, CompanyFields
from app.services.invoices import get_company

router = APIRouter(prefix="/api/company", tags=["company"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=Company)
def read_company(session: SessionDep) -> Company:
    return get_company(session)


@router.put("", response_model=Company)
def update_company(body: CompanyFields, session: SessionDep) -> Company:
    company = get_company(session)
    company.sqlmodel_update(body.model_dump())
    session.add(company)
    session.commit()
    session.refresh(company)
    return company
