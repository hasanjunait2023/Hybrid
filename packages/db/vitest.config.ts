import { defineConfig } from "vitest/config";

export default defineConfig({
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
