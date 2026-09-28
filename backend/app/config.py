from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
SEED_FILE = APP_DIR / "seed" / "seed.json"
FONTS_DIR = APP_DIR / "fonts"

WEEK_SECONDS = 7 * 24 * 3600
DEFAULT_SECRET_KEY = "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env", extra="ignore")

    data_dir: Path = BACKEND_DIR / "data"
    static_dir: Path = BACKEND_DIR / "static"
    demo_password: str = "demo2026"
    secret_key: str = DEFAULT_SECRET_KEY
    session_max_age_s: int = WEEK_SECONDS
    cookie_secure: bool = False
    seed_on_startup: bool = True

    @property
    def database_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'invoices.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
