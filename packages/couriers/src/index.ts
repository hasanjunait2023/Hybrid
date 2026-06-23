// Public surface of @hybrid/couriers. PURE package: the adapter takes an
// injected fetch-like and per-call creds; no Next, no DB, no env reads.
export { SteadfastProvider } from "./steadfast";
export type { SteadfastProviderOptions } from "./steadfast";
export { mapSteadfastStatus, KNOWN_STEADFAST_STATUSES } from "./statusMap";
export type { MappedStatus } from "./statusMap";

export type {
  CourierAdapter,
  CourierCreds,
  FetchLike,
  ShipmentStatus,
  OrderFulfillmentStatus,
  ConsignmentInput,
  ConsignmentResult,
  StatusResult,
} from "./types";
