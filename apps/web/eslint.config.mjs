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
];
