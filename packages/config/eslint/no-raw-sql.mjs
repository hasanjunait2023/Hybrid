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
      "@hybrid/db/client is internal to packages/db. Import withTenant/asPlatformAdmin/adminSql from @hybrid/db instead.",
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
