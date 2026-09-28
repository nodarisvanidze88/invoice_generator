from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from app.auth import SESSION_COOKIE, is_valid_token, issue_token, password_matches
from app.config import Settings, get_settings
from app.schemas import LoginRequest, SessionInfo

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=SessionInfo)
def login(body: LoginRequest, response: Response, settings: Annotated[Settings, Depends(get_settings)]) -> SessionInfo:
    if not password_matches(body.password, settings):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong password")
    response.set_cookie(
        SESSION_COOKIE,
        issue_token(settings),
        max_age=settings.session_max_age_s,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )
    return SessionInfo(authenticated=True)


@router.post("/logout", response_model=SessionInfo)
def logout(response: Response, settings: Annotated[Settings, Depends(get_settings)]) -> SessionInfo:
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="lax", secure=settings.cookie_secure)
    return SessionInfo(authenticated=False)


@router.get("/me", response_model=SessionInfo)
def me(
    settings: Annotated[Settings, Depends(get_settings)],
    invoice_session: Annotated[str | None, Cookie()] = None,
) -> SessionInfo:
    return SessionInfo(authenticated=is_valid_token(invoice_session, settings))
