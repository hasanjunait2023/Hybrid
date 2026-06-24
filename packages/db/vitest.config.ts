import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Array form (ordered) so the "@/" Next path alias can be a regex that
    // doesn't swallow the "@hybrid/*" package aliases. Most specific first.
    alias: [
      // The commerce/admin/courier/checkout cores import "@hybrid/db". When the
      // suites pull those modules in, packages/db has no self-symlink for
      // @hybrid/db, so alias it to the package source. Test-only wiring; the
      // apps/web source keeps its real @hybrid/db import.
      { find: "@hybrid/db", replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
      // The courier wiring (apps/web/lib/couriers/*) imports "@hybrid/couriers".
      { find: "@hybrid/couriers", replacement: fileURLToPath(new URL("../couriers/src/index.ts", import.meta.url)) },
      // The checkout wiring (apps/web/lib/payments/*) imports "@hybrid/payments".
      { find: "@hybrid/payments", replacement: fileURLToPath(new URL("../payments/src/index.ts", import.meta.url)) },
      // The admin dashboard helper imports "next/cache" (unstable_cache /
      // revalidateTag). Stub it to a passthrough so the data path is testable.
      { find: "next/cache", replacement: fileURLToPath(new URL("./test/next-cache-stub.ts", import.meta.url)) },
      // The auth session module reads/writes cookies via "next/headers". Stub it
      // with an in-memory cookie/header store so the session lifecycle is
      // testable outside the Next request runtime.
      { find: "next/headers", replacement: fileURLToPath(new URL("./test/next-headers-stub.ts", import.meta.url)) },
      // The OTP issuance path rate-limits via "@/lib/redis/client". Back it with
      // an in-memory ioredis-shaped stub so the BLOCK path is deterministic
      // without a real Redis. Must precede the broad "@/*" rule below.
      { find: "@/lib/redis/client", replacement: fileURLToPath(new URL("./test/redis-client-stub.ts", import.meta.url)) },
      // The checkout payment wiring marks itself "server-only" (a Next build
      // guard). Outside Next, alias it to a no-op so the module imports cleanly.
      { find: "server-only", replacement: fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)) },
      // The checkout slice uses the Next "@/*" path alias (tsconfig @/* -> ./*).
      // Map it to the web app root. Regex-anchored so it never shadows @hybrid/*.
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("../../apps/web/$1", import.meta.url)) },
    ],
  },
  test: {
    // RLS tests hit a real Postgres; run serially and allow generous startup.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // globalSetup boots an ephemeral embedded Postgres once for the whole suite
    // (no Docker / system PG needed); setupFiles injects its connection strings
    // into each worker before client.ts is imported.
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
