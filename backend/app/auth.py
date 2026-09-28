import hmac
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.config import Settings, get_settings

SESSION_COOKIE = "invoice_session"
SESSION_PAYLOAD = "demo-user"


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt="session")


def password_matches(candidate: str, settings: Settings) -> bool:
    return hmac.compare_digest(candidate.encode(), settings.demo_password.encode())


def issue_token(settings: Settings) -> str:
    return _serializer(settings).dumps(SESSION_PAYLOAD)


def is_valid_token(token: str | None, settings: Settings) -> bool:
    if not token:
        return False
    try:
        return _serializer(settings).loads(token, max_age=settings.session_max_age_s) == SESSION_PAYLOAD
    except BadSignature:
        return False


def require_session(
    settings: Annotated[Settings, Depends(get_settings)],
    invoice_session: Annotated[str | None, Cookie()] = None,
) -> None:
    if not is_valid_token(invoice_session, settings):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
