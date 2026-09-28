import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from app.auth import require_session
from app.config import DEFAULT_SECRET_KEY, get_settings
from app.db import create_tables, get_engine
from app.routers import auth, company, customers, imports, invoices, products
from app.seed_loader import seed_database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.secret_key == DEFAULT_SECRET_KEY:
        logger.warning("APP_SECRET_KEY is not set — using the insecure development default")
    create_tables()
    if settings.seed_on_startup:
        with Session(get_engine()) as session:
            seed_database(session)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Invoice Generator", version="1.0.0", lifespan=lifespan)
    app.include_router(auth.router)
    protected = [Depends(require_session)]
    for module in (products, customers, company, invoices, imports):
        app.include_router(module.router, dependencies=protected)

    @app.get("/api/health", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    mount_frontend(app)
    return app


def mount_frontend(app: FastAPI) -> None:
    static_dir = get_settings().static_dir
    index_file = static_dir / "index.html"
    if not index_file.exists():
        return
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        candidate = (static_dir / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
            return FileResponse(candidate)
        return FileResponse(index_file)


app = create_app()
