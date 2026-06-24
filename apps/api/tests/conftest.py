"""Test fixtures. Env is set BEFORE importing the app so Settings load. Tests run
the app via httpx ASGITransport, which does NOT trigger lifespan — so no real DB
pool or httpx client is opened; DB-touching paths are overridden per-test.
"""
import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://app_runtime_login:pw@localhost:5432/postgres"
)
# Dev stub key (valid base64 of 32 bytes) — matches .env.example; tests never hit real creds.
os.environ.setdefault("APP_ENCRYPTION_KEY", "/e9mXQaa3JuDz/82MaoeynOpPzHv6qm7bo2jtM8sCaw=")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def app_instance():
    get_settings.cache_clear()
    return create_app()


@pytest_asyncio.fixture
async def client(app_instance):
    transport = httpx.ASGITransport(app=app_instance)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
