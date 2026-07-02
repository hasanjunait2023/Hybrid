// Public surface of @hybrid/db. client.ts (sql) is intentionally NOT exported.
export { withTenant, withReadOnlyTenant, asPlatformAdmin, withBuyer, withPublic } from "./withTenant";
export type { Tx } from "./withTenant";
// adminSql is exported for platform-level lookups (host->tenant) and tooling.
export { adminSql } from "./client";
// Read-only replica query helper for scaling SELECT traffic.
export { readSql } from "./client";
export type * from "./types";
// Credential crypto (AES-256-GCM) for payment_account/courier_account secrets.
export { sealCredentials, openCredentials, isSealed } from "./crypto";
export type { SealedSecret } from "./crypto";
