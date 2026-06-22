/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @hybrid/* packages ship raw TS/TSX; let Next transpile them.
  transpilePackages: ["@hybrid/ui", "@hybrid/db"],
  // postgres.js is server-only; keep it out of any client/edge bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
