"""Steadfast delivery_status -> internal (shipment_status, order_fulfillment_status).

Faithful port of packages/couriers/src/statusMap.ts. Unknown statuses fall back
to in_transit (the parcel is somewhere in the network, not lost — don't wrongly
terminalize the order).
"""

_MAP: dict[str, dict[str, str]] = {
    "pending": {"shipment_status": "created", "order_fulfillment_status": "confirmed"},
    "in_review": {"shipment_status": "created", "order_fulfillment_status": "confirmed"},
    "hold": {"shipment_status": "in_transit", "order_fulfillment_status": "in_transit"},
    "delivered_approval_pending": {"shipment_status": "in_transit", "order_fulfillment_status": "in_transit"},
    "delivered": {"shipment_status": "delivered", "order_fulfillment_status": "delivered"},
    "partial_delivered": {"shipment_status": "delivered", "order_fulfillment_status": "delivered"},
    "cancelled": {"shipment_status": "cancelled", "order_fulfillment_status": "returned"},
}

_UNKNOWN_FALLBACK = {"shipment_status": "in_transit", "order_fulfillment_status": "in_transit"}

KNOWN_STEADFAST_STATUSES = list(_MAP.keys())


def map_steadfast_status(raw: str) -> dict[str, str]:
    key = (raw or "").lower().strip()
    return _MAP.get(key, _UNKNOWN_FALLBACK)
