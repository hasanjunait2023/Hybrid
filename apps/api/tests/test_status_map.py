"""Steadfast status mapping contract (mirrors the TS statusMap test)."""
from app.couriers.status_map import KNOWN_STEADFAST_STATUSES, map_steadfast_status


def test_known_statuses_map():
    assert map_steadfast_status("delivered") == {
        "shipment_status": "delivered",
        "order_fulfillment_status": "delivered",
    }
    assert map_steadfast_status("PENDING")["shipment_status"] == "created"  # case-insensitive
    assert map_steadfast_status(" cancelled ")["shipment_status"] == "cancelled"  # trimmed


def test_unknown_falls_back_to_in_transit():
    assert map_steadfast_status("some_brand_new_status") == {
        "shipment_status": "in_transit",
        "order_fulfillment_status": "in_transit",
    }
    assert map_steadfast_status("")["shipment_status"] == "in_transit"


def test_documented_status_set():
    assert set(KNOWN_STEADFAST_STATUSES) == {
        "pending",
        "in_review",
        "hold",
        "delivered_approval_pending",
        "delivered",
        "partial_delivered",
        "cancelled",
    }
