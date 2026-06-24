"""Read + decrypt a tenant's Steadfast credentials from courier_account.

Port of readSteadfastCreds (apps/web/lib/couriers/steadfast.ts). MUST be called
on a connection already inside a with_tenant() transaction so RLS scopes the read
to the tenant and the sealed secret is only ever opened server-side. Returns None
when no enabled/sealed account exists (caller decides skip vs error).
"""
import json

import asyncpg

from ..crypto import is_sealed, open_credentials


async def read_steadfast_creds(conn: asyncpg.Connection) -> dict[str, str] | None:
    row = await conn.fetchrow(
        "select is_enabled, credentials from courier_account where provider = 'steadfast' limit 1"
    )
    if row is None or not row["is_enabled"]:
        return None

    # asyncpg returns jsonb as a str by default; normalize to a dict.
    raw = row["credentials"]
    envelope = json.loads(raw) if isinstance(raw, str) else raw
    if not is_sealed(envelope):
        return None

    opened = open_credentials(envelope)
    if not opened.get("apiKey") or not opened.get("secretKey"):
        return None
    return {"apiKey": opened["apiKey"], "secretKey": opened["secretKey"]}
