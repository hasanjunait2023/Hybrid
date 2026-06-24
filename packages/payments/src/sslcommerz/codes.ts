// SSLCommerz status → PaymentState mapping.
//
// The session-init response carries a `status` ("SUCCESS"/"FAILED"). The IPN +
// validation API carry a transaction `status`: VALID / VALIDATED = settled,
// FAILED / CANCELLED / UNATTEMPTED otherwise. We treat only VALID/VALIDATED as a
// settled success; an init "SUCCESS" (gateway page created) is still pending.
import type { PaymentState } from "../types";

// Map the SSLCommerz session-init `status` to a PaymentState. A created gateway
// page is "pending" (the customer has not paid yet).
export function mapSslcommerzInitState(body: { status?: string }): PaymentState {
  return body.status === "SUCCESS" ? "pending" : "failed";
}

// Map the validation/IPN transaction `status` to a PaymentState.
export function mapSslcommerzTxnState(body: { status?: string }): PaymentState {
  switch (body.status) {
    case "VALID":
    case "VALIDATED":
      return "success";
    case "CANCELLED":
      return "cancelled";
    case "FAILED":
    case "UNATTEMPTED":
    case "EXPIRED":
      return "failed";
    case undefined:
      return "pending";
    default:
      return "failed";
  }
}
