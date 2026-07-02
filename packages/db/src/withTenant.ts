import type { TransactionSql } from "postgres";
import { sql, readSql } from "./client";

// The transaction handle postgres.js passes into sql.begin's callback.
// (Equivalent to the blueprint's Parameters<Parameters<typeof sql.begin>[0]>[0],
// but referencing the exported type so the tagged-template call signature is
// preserved for callers — see build report note.)
export type Tx = TransactionSql<Record<string, never>>;

// Run `fn` inside a transaction with the tenant RLS context set.
// set_config(..., true) is transaction-local: cleared on COMMIT/ROLLBACK, so it
// never leaks across pooled connections. A throw triggers automatic ROLLBACK.
export async function withTenant<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx`SELECT set_config('app.current_user_id', ${userId ?? ""}, true)`;
    await tx`SELECT set_config('app.is_platform_admin', 'false', true)`;
    return fn(tx);
  }) as Promise<T>;
}

// Read-only replica variant of withTenant.
// Uses READ_DATABASE_URL (falls back to DATABASE_URL). Safe for SELECT-only
// traffic; writes inside the callback will be rolled back because we begin a
// read-only transaction, but we keep the same RLS context contract so callers
// can swap transparently.
export async function withReadOnlyTenant<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return readSql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx`SELECT set_config('app.current_user_id', ${userId ?? ""}, true)`;
    await tx`SELECT set_config('app.is_platform_admin', 'false', true)`;
    await tx`SET TRANSACTION READ ONLY`;
    return fn(tx);
  }) as Promise<T>;
}

// Platform-admin context: bypasses tenant scoping via app.is_platform_admin().
// Used for host->tenant lookup and platform provisioning. Still a real txn.
export async function asPlatformAdmin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', '', true)`;
    await tx`SELECT set_config('app.current_user_id', '', true)`;
    await tx`SELECT set_config('app.is_platform_admin', 'true', true)`;
    return fn(tx);
  }) as Promise<T>;
}

// Anonymous public context: no tenant, no buyer, not admin. Reads only reach
// world-readable tables (plan/theme + the marketplace catalog projection, whose
// policies are USING (true)); every tenant/buyer-scoped table returns zero rows.
// This is the safe path for public marketplace browse — never asPlatformAdmin.
export async function withPublic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', '', true)`;
    await tx`SELECT set_config('app.current_user_id', '', true)`;
    await tx`SELECT set_config('app.current_buyer_id', '', true)`;
    await tx`SELECT set_config('app.is_platform_admin', 'false', true)`;
    return fn(tx);
  }) as Promise<T>;
}

// Marketplace buyer context: a buyer sees only their own rows via
// app.current_buyer_id() (marketplace_customer/order/suborder/review). Mirrors
// withTenant exactly — all three GUCs are pinned so a pooled connection that
// last ran asPlatformAdmin can never leak is_platform_admin=true into a buyer
// transaction. set_config(..., true) is transaction-local. RLS stays sacred:
// buyer data never travels the asPlatformAdmin path during normal operation.
export async function withBuyer<T>(buyerId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_buyer_id', ${buyerId}, true)`;
    await tx`SELECT set_config('app.current_tenant_id', '', true)`;
    await tx`SELECT set_config('app.current_user_id', '', true)`;
    await tx`SELECT set_config('app.is_platform_admin', 'false', true)`;
    return fn(tx);
  }) as Promise<T>;
}
