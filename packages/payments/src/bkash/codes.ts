// bKash Tokenized status-code → PaymentState mapping.
//
// bKash responses carry both a numeric-ish `statusCode` ("0000" on success,
// non-zero error codes otherwise) and a `transactionStatus` string
// ("Initiated" | "Completed" | "Failed" | "Cancelled"). We treat 0000 +
// Completed as the only success; everything else maps to a non-success state.
import type { PaymentState } from "../types";

const SUCCESS_CODE = "0000";

// Map a bKash create/execute/query response body to a PaymentState.
// `statusCode` is authoritative for transport-level success; `transactionStatus`
// disambiguates the terminal outcome.
export function mapBkashState(body: {
  statusCode?: string;
  transactionStatus?: string;
}): PaymentState {
  const { statusCode, transactionStatus } = body;

  // Non-0000 statusCode = the gateway rejected the call (auth/validation/etc).
  if (statusCode && statusCode !== SUCCESS_CODE) {
    return "failed";
  }

  switch (transactionStatus) {
    case "Completed":
      return "success";
    case "Cancelled":
      return "cancelled";
    case "Failed":
      return "failed";
    case "Initiated":
    case undefined:
      // Created/awaiting-execute. statusCode 0000 with no terminal status yet.
      return "pending";
    default:
      return "failed";
  }
}

export { SUCCESS_CODE };
