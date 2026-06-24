import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @hybrid/* packages ship raw TS/TSX; let Next transpile them.
  transpilePackages: ["@hybrid/ui", "@hybrid/db"],
  // Server-only native/binary deps — keep them out of any client/edge bundle.
  // postgres.js (DB driver) and @node-rs/argon2 (napi-rs native binary for
  // own-auth password hashing) must not be bundled.
  serverExternalPackages: ["postgres", "@node-rs/argon2"],
};

// Redis-backed ISR/unstable_cache handler.
//
// Only activate when REDIS_URL is present (production / staging).
// When absent (local dev, CI, tests) Next falls back to its built-in
// in-memory cache — no Redis required to run locally.
//
// cacheMaxMemorySize: 0  disables the in-process LRU memory cache so ALL
// reads and revalidations hit the shared Redis store, making multi-instance
// revalidateTag() reliable (every pod sees the invalidation immediately).
if (process.env.REDIS_URL) {
  nextConfig.cacheHandler = require.resolve("./cache-handler.cjs");
  nextConfig.cacheMaxMemorySize = 0;
}

export default nextConfig;
