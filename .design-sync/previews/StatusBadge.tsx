import * as React from "react";
import { StatusBadge } from "@hybrid/ui";

export const Fulfillment = () => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 28, background: "#fff" }}>
    <StatusBadge kind="fulfillment" value="pending" />
    <StatusBadge kind="fulfillment" value="confirmed" />
    <StatusBadge kind="fulfillment" value="packed" />
    <StatusBadge kind="fulfillment" value="shipped" />
    <StatusBadge kind="fulfillment" value="delivered" />
    <StatusBadge kind="fulfillment" value="returned" />
    <StatusBadge kind="fulfillment" value="cancelled" />
  </div>
);

export const PaymentAndMethod = () => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 28, background: "#fff" }}>
    <StatusBadge kind="payment" value="paid" />
    <StatusBadge kind="payment" value="unpaid" />
    <StatusBadge kind="cod" value="collected" />
    <StatusBadge kind="cod" value="pending" />
    <StatusBadge kind="method" value="bkash" />
    <StatusBadge kind="method" value="cod" />
  </div>
);
