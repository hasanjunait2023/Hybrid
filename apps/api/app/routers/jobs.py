"""Background job triggers. All routes are CRON_SECRET-gated (router dependency).

A trigger drives the sweep synchronously and returns its tally; a scheduler
(cron / the Next.js side / a future queue worker) calls these on an interval.
"""
from fastapi import APIRouter, Depends, Request

from ..config import Settings, get_settings
from ..couriers.steadfast import SteadfastClient, StatusFetcher
from ..couriers.sync import run_courier_sweep
from ..schemas.common import ErrorResponse
from ..schemas.courier import CourierSyncResponse
from ..security import require_cron_secret

router = APIRouter(prefix="/jobs", tags=["jobs"], dependencies=[Depends(require_cron_secret)])


def get_status_fetcher(
    request: Request, settings: Settings = Depends(get_settings)
) -> StatusFetcher:
    """The Steadfast client, bound to the app's shared httpx client. Overridable
    in tests to inject a fake (no network)."""
    return SteadfastClient(request.app.state.http, settings.steadfast_base_url)


@router.post(
    "/courier-sync",
    response_model=CourierSyncResponse,
    responses={401: {"model": ErrorResponse, "description": "Missing/invalid CRON_SECRET"}},
    summary="Reconcile courier (Steadfast) shipment statuses across all tenants",
)
async def courier_sync(
    fetcher: StatusFetcher = Depends(get_status_fetcher),
) -> CourierSyncResponse:
    result = await run_courier_sweep(fetcher)
    return CourierSyncResponse(**result)
