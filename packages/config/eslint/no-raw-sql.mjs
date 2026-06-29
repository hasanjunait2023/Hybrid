// Custom ESLint flat-config fragment: forbid raw SQL client access.
//
// Tenant data MUST flow through @hybrid/db's withTenant / asPlatformAdmin.
// Importing the postgres.js driver directly, or the internal @hybrid/db/client
// module, bypasses RLS context and is therefore banned everywhere EXCEPT inside
// packages/db itself (which legitimately owns the driver).
//
// Apply this fragment in any consumer's eslint.config.mjs. It is a flat-config
// object (array entry), not a plugin, so it composes cleanly.

const FORBIDDEN = [
  {
    name: "postgres",
    message:
      "Do not import 'postgres' directly. Use withTenant()/asPlatformAdmin() from @hybrid/db so RLS context is always set.",
  },
  {
    name: "@hybrid/db/client",
    message:
      "@hybrid/db/client is internal to packages/db. Import withTenant/asPlatformAdmin from @hybrid/db instead.",
  },
  {
    // adminSql is the `postgres` (BYPASSRLS) superuser pool — a single
    // adminSql`select ...` returns EVERY tenant's rows with no RLS filtering and
    // no other warning. Banned in consumers; use withTenant()/asPlatformAdmin().
    // Legit raw-connection needs (e.g. LISTEN/pg_notify) require a scoped,
    // commented per-file override in the consumer's eslint.config.
    name: "@hybrid/db",
    importNames: ["adminSql"],
    message:
      "adminSql bypasses tenant RLS (postgres superuser pool). Use withTenant()/asPlatformAdmin() from @hybrid/db. For a genuine LISTEN/raw-connection need, add a scoped eslint override.",
  },
];

/** @type {import('eslint').Linter.Config} */
export const noRawSql = {
  name: "hybrid/no-raw-sql",
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: FORBIDDEN,
        patterns: [
          {
            group: ["postgres", "postgres/*"],
            message:
              "Do not import the postgres.js driver outside packages/db. Use @hybrid/db.",
          },
          {
            group: ["**/db/src/client", "**/db/src/client.*", "@hybrid/db/client"],
            message:
              "client.ts is internal to packages/db. Use @hybrid/db exports.",
          },
        ],
      },
    ],
  },
};

export default noRawSql;
