// Public surface of @hybrid/couriers. PURE package: the adapter takes an
// injected fetch-like and per-call creds; no Next, no DB, no env reads.
export { SteadfastProvider } from "./steadfast";
export type { SteadfastProviderOptions } from "./steadfast";
export { mapSteadfastStatus, KNOWN_STEADFAST_STATUSES } from "./statusMap";
export type { MappedStatus } from "./statusMap";

export { PathaoProvider } from "./pathao/provider";
export type { PathaoProviderOptions, PathaoRefreshCallback } from "./pathao/provider";
export { mapPathaoStatus, KNOWN_PATHAO_STATUSES } from "./pathao/statusMap";

export { RedxProvider } from "./redx/provider";
export { PaperflyProvider } from "./paperfly/provider";

export { CourierNotConfiguredError } from "./types";

export type {
  CourierAdapter,
  CourierProvider,
  CourierCreds,
  TokenStore,
  FetchLike,
  ShipmentStatus,
  OrderFulfillmentStatus,
  ConsignmentInput,
  ConsignmentResult,
  StatusResult,
} from "./types";
