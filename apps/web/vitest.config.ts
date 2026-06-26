import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["lib/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      { find: "@/lib/redis/client", replacement: fileURLToPath(new URL("./lib/redis/__tests__/redis-stub.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
});