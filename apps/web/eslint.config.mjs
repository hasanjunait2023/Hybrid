// apps/web is a no-raw-sql zone: importing 'postgres' or @hybrid/db/client is
// an error here. Tenant data must come from @hybrid/db (withTenant/asPlatformAdmin).
import { next } from "@hybrid/config/eslint/next";

export default [
  {
    // cache-handler.cjs is a CommonJS file (Next.js runs it in a CJS context);
    // ESLint's ESM-based flat config cannot parse it as a module.
    ignores: [".next/**", "next-env.d.ts", "cache-handler.cjs"],
  },
  ...next,
  {
    // notify.ts opens a long-lived LISTEN connection (pg_notify) that the
    // transaction-scoped withTenant/asPlatformAdmin can't provide, so it
    // legitimately imports adminSql. Re-allow ONLY adminSql here; the postgres
    // driver and @hybrid/db/client stay banned.
    files: ["lib/orders/notify.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
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
  },
];
