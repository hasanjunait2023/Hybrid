// Nagad status → PaymentState mapping.
//
// Nagad responses carry a `status` field. On the checkout/complete responses the
// success marker is "Success"; the verify endpoint returns a `status` of
// "Success" with a settled `statusCode` "000". Anything else is non-success.
//   Success / Aborted / Cancelled / Failed are the documented terminal strings.
import type { PaymentState } from "../types";

const SUCCESS = "Success";

// Map a Nagad response body (init/complete/verify share the shape we read) to a
// PaymentState. `status` is the authoritative terminal marker.
export function mapNagadState(body: { status?: string }): PaymentState {
  switch (body.status) {
    case "Success":
      return "success";
    case "Aborted":
    case "Cancelled":
      return "cancelled";
    case "Failed":
      return "failed";
    case undefined:
      // Initialized/awaiting redirect.
      return "pending";
    default:
      return "failed";
  }
}

export { SUCCESS as NAGAD_SUCCESS };
