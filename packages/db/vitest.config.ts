import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // The commerce core (apps/web/lib/commerce/*) imports "@hybrid/db". When
      // commerce.test.ts pulls those modules into this suite, packages/db has no
      // self-symlink for @hybrid/db, so alias it to the package source. This is
      // test-only wiring; the apps/web source keeps its real @hybrid/db import.
      "@hybrid/db": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
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
