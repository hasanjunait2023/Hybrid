// INTERNAL to @hybrid/db. NOT exported from the package (see package.json exports).
// The no-raw-sql ESLint rule forbids importing this module (or 'postgres')
// anywhere outside packages/db. All tenant traffic goes through withTenant().
import postgres from "postgres";
import "dotenv/config";

// Runtime connection — app_runtime_login (non-superuser) -> RLS is FORCED.
// prepare:false is required under transaction-mode poolers (pgBouncer/Supavisor).
export const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  prepare: false,
});

// Read-replica connection for SELECT-heavy, read-only traffic.
// Falls back to the primary DATABASE_URL when no replica is configured.
export const readSql = postgres(process.env.READ_DATABASE_URL || process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  prepare: false,
});

// Direct/superuser connection — postgres -> bypasses RLS.
// Used only for migrations, seed, type generation, and host lookups.
export const adminSql = postgres(process.env.DIRECT_URL!, {
  max: 4,
  idle_timeout: 20,
  prepare: false,
});
