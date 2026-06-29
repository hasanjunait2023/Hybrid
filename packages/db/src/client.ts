// INTERNAL to @hybrid/db. NOT exported from the package (see package.json exports).
// The no-raw-sql ESLint rule forbids importing this module (or 'postgres')
// anywhere outside packages/db. All tenant traffic goes through withTenant().
import postgres from "postgres";
import "dotenv/config";

// Runtime connection — app_runtime_login (non-superuser) -> RLS is FORCED.
// prepare:false is required under transaction-mode poolers (pgBouncer/Supavisor).
export const sql = postgres(process.env.DATABASE_URL!, {
  max: 30,
  idle_timeout: 20,
  prepare: false,
});

// Direct/superuser connection — postgres -> bypasses RLS.
// Used only for migrations, seed, type generation, and host lookups.
export const adminSql = postgres(process.env.DIRECT_URL!, {
  max: 6,
  idle_timeout: 20,
  prepare: false,
});
