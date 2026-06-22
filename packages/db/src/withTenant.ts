import type { TransactionSql } from "postgres";
import { sql } from "./client";

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
