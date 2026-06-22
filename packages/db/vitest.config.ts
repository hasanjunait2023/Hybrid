import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // RLS tests hit a real Postgres; run serially and allow generous startup.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["./test/setup.ts"],
  },
});
