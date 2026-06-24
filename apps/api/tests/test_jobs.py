"""Job-trigger auth + response contract. The sweep itself is faked (no DB/network);
the courier sweep's DB/RLS logic is covered by integration tests against a real DB."""
import pytest

import app.routers.jobs as jobs_module
from app.routers.jobs import get_status_fetcher

pytestmark = pytest.mark.asyncio


async def test_courier_sync_requires_secret(client):
    res = await client.post("/jobs/courier-sync")
    assert res.status_code == 401


async def test_courier_sync_rejects_wrong_secret(client):
    res = await client.post("/jobs/courier-sync", headers={"Authorization": "Bearer nope"})
    assert res.status_code == 401


async def test_courier_sync_ok(client, app_instance, monkeypatch):
    async def fake_sweep(_fetcher):
        return {"tenants": 2, "synced": 5, "skipped": 1}

    monkeypatch.setattr(jobs_module, "run_courier_sweep", fake_sweep)
    # Override the fetcher dep so app.state.http (set only in lifespan) isn't touched.
    app_instance.dependency_overrides[get_status_fetcher] = lambda: object()
    try:
        res = await client.post(
            "/jobs/courier-sync", headers={"Authorization": "Bearer test-cron-secret"}
        )
        assert res.status_code == 200
        assert res.json() == {"ok": True, "tenants": 2, "synced": 5, "skipped": 1}
    finally:
        app_instance.dependency_overrides.clear()
