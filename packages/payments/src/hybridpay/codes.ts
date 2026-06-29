// Hybrid Pay transaction `status` → PaymentState mapping.
//
// Hybrid Pay is Hybrid's white-labeled payment gateway, powered under the hood
// by a self-hosted PipraPay instance. The verify-payment call returns a
// transaction `status`:
//   completed = settled success
//   refunded  = money returned
//   pending   = created but not yet paid/verified
//   cancelled = customer abandoned
// anything else (failed/error/empty) is treated as a non-settled failure.
import type { PaymentState } from "../types";

export function mapHybridpayState(status: string | undefined): PaymentState {
  switch (status) {
    case "completed":
      return "success";
    case "refunded":
      return "refunded";
    case "pending":
      return "pending";
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}
