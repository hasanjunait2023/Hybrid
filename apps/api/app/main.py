"""App factory + ASGI entrypoint.

`uvicorn app.main:app`. Lifespan opens the asyncpg pool and a shared httpx client
on startup and closes both on shutdown. A catch-all handler turns unhandled
exceptions into a generic 500 (no internals/secrets leaked); FastAPI's own
HTTPException handling (e.g. the 401 from require_cron_secret) is preserved.
"""
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import __version__
from .config import get_settings
from .db import close_pool, init_pool
from .logging_config import configure_logging
from .routers import health, jobs

log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    await init_pool()
    app.state.http = httpx.AsyncClient(timeout=get_settings().http_timeout_seconds)
    log.info("hybrid-jobs %s started", __version__)
    try:
        yield
    finally:
        await app.state.http.aclose()
        await close_pool()
        log.info("hybrid-jobs stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Hybrid Jobs API",
        version=__version__,
        description=(
            "Async/background jobs for Hybrid (courier status sync, COD "
            "reconciliation). Connects to the self-hosted Supabase Postgres as "
            "app_runtime_login — RLS is FORCED; every tenant query goes through "
            "with_tenant()/as_platform_admin() (see app.db)."
        ),
        lifespan=lifespan,
    )
    app.include_router(health.router)
    app.include_router(jobs.router)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"ok": False, "error": "internal server error"})

    return app


app = create_app()
