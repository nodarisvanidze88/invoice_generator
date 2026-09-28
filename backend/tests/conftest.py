from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import get_engine

TEST_PASSWORD = "test-pass"


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("APP_DEMO_PASSWORD", TEST_PASSWORD)
    monkeypatch.setenv("APP_SEED_ON_STARTUP", "false")
    monkeypatch.setenv("APP_STATIC_DIR", str(tmp_path / "no-static"))
    get_settings.cache_clear()
    get_engine.cache_clear()
    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client
    get_engine().dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()


@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    assert client.post("/api/auth/login", json={"password": TEST_PASSWORD}).status_code == 200
    return client


@pytest.fixture
def make_product(auth_client: TestClient):
    def _make(**overrides) -> dict:
        payload = {
            "code": "4901234567890",
            "name": "Pineapple Candy 110g",
            "material": "",
            "origin": "Japan",
            "weight_g": 120,
            "unit_price": 132.5,
            "category": "Sugar-based Candy",
            "tariff_code": "17049099",
        } | overrides
        response = auth_client.post("/api/products", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _make
