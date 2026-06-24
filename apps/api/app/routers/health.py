"""Liveness + DB readiness probes."""
from fastapi import APIRouter, Response, status

from .. import __version__
from ..db import get_pool
from ..schemas.common import DbHealthResponse, HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(service="hybrid-jobs", version=__version__)


@router.get("/healthz/db", response_model=DbHealthResponse)
async def health_db(response: Response) -> DbHealthResponse:
    try:
        async with get_pool().acquire() as conn:
            await conn.execute("select 1")
        return DbHealthResponse(status="ok", database="up")
    except Exception:  # pool down / not initialized → report unhealthy (503)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return DbHealthResponse(status="degraded", database="down")
