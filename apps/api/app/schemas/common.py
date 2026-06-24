"""Shared response schemas (response models are documented in OpenAPI)."""
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str
    version: str


class DbHealthResponse(BaseModel):
    status: str  # "ok" | "degraded"
    database: str  # "up" | "down"


class ErrorResponse(BaseModel):
    ok: bool = False
    error: str
