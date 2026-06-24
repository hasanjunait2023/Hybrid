import pytest

pytestmark = pytest.mark.asyncio


async def test_health_ok(client):
    res = await client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "hybrid-jobs"


async def test_db_health_degraded_without_pool(client):
    # ASGITransport skips lifespan, so the pool is never initialized → 503 down.
    res = await client.get("/healthz/db")
    assert res.status_code == 503
    assert res.json()["database"] == "down"
