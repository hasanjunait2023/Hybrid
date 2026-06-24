"""Steadfast adapter (httpx). Port of packages/couriers/src/steadfast.ts.

PURE-ish: takes an injected httpx.AsyncClient + per-call creds (never holds
secrets). Base https://portal.steadfast.com.bd/api/v1, auth via Api-Key /
Secret-Key headers. No sandbox exists — contract-shaped; live verification is
deferred until a merchant account exists (same as the TS side).

The sweep depends on the `StatusFetcher` Protocol, so tests inject a fake with
no network.
"""
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from .status_map import map_steadfast_status


@dataclass
class StatusResult:
    shipment_status: str
    fulfillment: str
    raw: dict[str, Any]


class StatusFetcher(Protocol):
    async def get_status(self, consignment_id: str, creds: dict[str, str]) -> StatusResult: ...


class SteadfastClient:
    def __init__(self, http: httpx.AsyncClient, base_url: str) -> None:
        self._http = http
        self._base = base_url.rstrip("/")

    @staticmethod
    def _headers(creds: dict[str, str]) -> dict[str, str]:
        api_key = creds.get("apiKey")
        secret_key = creds.get("secretKey")
        if not api_key or not secret_key:
            raise ValueError("Steadfast credentials incomplete (apiKey/secretKey required)")
        return {"Api-Key": api_key, "Secret-Key": secret_key, "Content-Type": "application/json"}

    async def get_status(self, consignment_id: str, creds: dict[str, str]) -> StatusResult:
        res = await self._http.get(
            f"{self._base}/status_by_cid/{consignment_id}", headers=self._headers(creds)
        )
        body: dict[str, Any] = res.json()
        mapped = map_steadfast_status(body.get("delivery_status") or "")
        return StatusResult(
            shipment_status=mapped["shipment_status"],
            fulfillment=mapped["order_fulfillment_status"],
            raw=body,
        )
