"""Typed settings (pydantic-settings). Fail-fast: required secrets raise at load.

Reads the SAME env contract as the web app (DATABASE_URL = app_runtime_login so
RLS is forced; APP_ENCRYPTION_KEY for sealed courier creds; CRON_SECRET to gate
job triggers).
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True
    )

    # DATABASE_URL must be the app_runtime_login (non-superuser) DSN → RLS FORCED.
    database_url: str = Field(alias="DATABASE_URL")
    # Superuser DSN (postgres). Optional here; jobs run RLS-scoped, not as admin.
    direct_url: str | None = Field(default=None, alias="DIRECT_URL")
    # Base64 32-byte key — opens sealed courier/payment creds (compat with crypto.ts).
    app_encryption_key: str = Field(alias="APP_ENCRYPTION_KEY")
    # Bearer secret guarding /jobs/* triggers (constant-time compared).
    cron_secret: str = Field(alias="CRON_SECRET")

    steadfast_base_url: str = Field(
        default="https://portal.steadfast.com.bd/api/v1", alias="STEADFAST_BASE_URL"
    )
    http_timeout_seconds: float = Field(default=15.0, alias="HTTP_TIMEOUT_SECONDS")

    db_pool_min: int = Field(default=1, alias="DB_POOL_MIN")
    db_pool_max: int = Field(default=10, alias="DB_POOL_MAX")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    environment: str = Field(default="production", alias="ENVIRONMENT")


@lru_cache
def get_settings() -> Settings:
    """Singleton settings. Overridable in tests via app.dependency_overrides."""
    return Settings()  # type: ignore[call-arg]  # values come from env
