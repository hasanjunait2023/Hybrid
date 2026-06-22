// apps/web is a no-raw-sql zone: importing 'postgres' or @hybrid/db/client is
// an error here. Tenant data must come from @hybrid/db (withTenant/asPlatformAdmin).
import { next } from "@hybrid/config/eslint/next";

export default [
  {
    ignores: [".next/**", "next-env.d.ts"],
  },
  ...next,
];
