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

export default nextConfig;
