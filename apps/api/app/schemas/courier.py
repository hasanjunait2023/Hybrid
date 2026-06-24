"""Courier job response schemas."""
from pydantic import BaseModel


class CourierSyncResponse(BaseModel):
    ok: bool = True
    tenants: int  # tenants enumerated for sync
    synced: int  # shipments polled + reconciled
    skipped: int  # tenants skipped (no live creds) or failed (isolated)
