"""Auth for internal job triggers — CRON_SECRET bearer (constant-time).

Mirrors the Next.js internal cron routes: `Authorization: Bearer <CRON_SECRET>`.
Fail-closed — an unset secret can never leave a route open. Used as a FastAPI
dependency so unauthorized calls are rejected before any handler logic runs.
"""
import hmac

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


def require_cron_secret(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = f"Bearer {settings.cron_secret}"
    presented = authorization or ""
    # compare_digest is constant-time and safe for unequal lengths (returns False).
    if not settings.cron_secret or not hmac.compare_digest(
        presented.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
