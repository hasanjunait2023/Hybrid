#!/usr/bin/env node
/**
 * healthcheck.mjs — invoked by Docker HEALTHCHECK on hybrid-web.
 *
 * Calls /api/healthz/auth on localhost and exits 0 if 200, 1 otherwise.
 * Designed to be extremely fast (~50ms) and have zero deps.
 *
 * Why a script and not inline node -e:
 *   - shell escaping inside YAML test: [...] blocks is a nightmare
 *   - keeping this readable makes future edits painless
 */

import http from "node:http";

const TIMEOUT_MS = 4000;

const req = http.get(
  { host: "127.0.0.1", port: 3000, path: "/api/healthz/auth", timeout: TIMEOUT_MS },
  (res) => {
    // Drain body (don't leave connection open) but we only care about status
    res.resume();
    if (res.statusCode === 200) {
      process.exit(0);
    }
    // 503 → degraded; any other → unexpected
    process.stderr.write(`healthcheck: /api/healthz/auth returned ${res.statusCode}\n`);
    process.exit(1);
  },
);
req.on("error", (e) => {
  process.stderr.write(`healthcheck: request failed: ${e.message}\n`);
  process.exit(1);
});
req.on("timeout", () => {
  req.destroy();
  process.stderr.write(`healthcheck: request timed out after ${TIMEOUT_MS}ms\n`);
  process.exit(1);
});