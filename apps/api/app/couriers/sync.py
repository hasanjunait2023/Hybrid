"""Courier status reconciliation sweep. Port of apps/web/lib/couriers/sync.ts +
the courier-sync cron route.

Flow:
  1. as_platform_admin: enumerate tenants with at least one non-terminal steadfast
     shipment (cross-tenant read).
  2. per tenant (with_tenant): read+decrypt creds; skip cleanly if not configured.
  3. sync_tenant_shipments: read active shipments, poll each status (network call
     OUTSIDE the txn), then update shipment + orders inside with_tenant.

Delivery only stamps delivered_at + the delivered status. cod_status stays
'pending' and cod_collected is NOT written — the COD is still owed until a
remittance reconciliation confirms the courier paid the seller. One tenant's
outage never aborts the sweep (isolated + logged).
"""
import json
import logging

from ..db import as_platform_admin, with_tenant
from .creds import read_steadfast_creds
from .steadfast import StatusFetcher

log = logging.getLogger(__name__)

_TERMINAL = ("delivered", "returned", "cancelled")


async def sync_tenant_shipments(
    tenant_id: str, creds: dict[str, str], client: StatusFetcher
) -> int:
    """Poll + reconcile every non-terminal steadfast shipment for one tenant."""
    async with with_tenant(tenant_id) as conn:
        rows = await conn.fetch(
            """
            select id, order_id, consignment_id
              from shipment
             where provider = 'steadfast'
               and consignment_id is not null
               and status not in ('delivered', 'returned', 'cancelled')
            """
        )

    count = 0
    for row in rows:
        # Live network call — deliberately outside any DB transaction.
        status = await client.get_status(str(row["consignment_id"]), creds)
        delivered = status.shipment_status == "delivered"

        async with with_tenant(tenant_id) as conn:
            await conn.execute(
                """
                update shipment
                   set status = $1::shipment_status,
                       raw_status = $2,
                       delivered_at = case when $3 then now() else null end,
                       updated_at = now()
                 where id = $4
                """,
                status.shipment_status,
                json.dumps(status.raw),
                delivered,
                row["id"],
            )
            await conn.execute(
                """
                update orders
                   set fulfillment_status = $1::order_fulfillment_status,
                       updated_at = now()
                 where id = $2
                """,
                status.fulfillment,
                row["order_id"],
            )
        count += 1
    return count


async def run_courier_sweep(client: StatusFetcher) -> dict[str, int]:
    """Top-level sweep across all tenants. Returns {tenants, synced, skipped}."""
    async with as_platform_admin() as conn:
        tenant_rows = await conn.fetch(
            """
            select distinct tenant_id
              from shipment
             where provider = 'steadfast'
               and status not in ('delivered', 'returned', 'cancelled')
            """
        )

    synced = 0
    skipped = 0
    for tr in tenant_rows:
        tenant_id = str(tr["tenant_id"])
        try:
            async with with_tenant(tenant_id) as conn:
                creds = await read_steadfast_creds(conn)
            if creds is None:
                skipped += 1
                log.warning("[courier-sync] skip tenant %s: courier not configured", tenant_id)
                continue
            synced += await sync_tenant_shipments(tenant_id, creds, client)
        except Exception:  # one tenant's outage never aborts the sweep
            skipped += 1
            log.exception("[courier-sync] tenant %s failed", tenant_id)

    return {"tenants": len(tenant_rows), "synced": synced, "skipped": skipped}
