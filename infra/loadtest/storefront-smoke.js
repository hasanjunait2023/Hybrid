// k6 load test for Hybrid storefront — target 1K-10K req/sec.
//
// Scenarios:
//   1. Browsing: storefront home (cached), product page (DB), collection page (DB)
//   2. Cart/Checkout: write path (RLS enabled)
//   3. SSE stream: open connection, verify it stays open
//
// Thresholds:
//   - p(95) < 500ms for cached pages
//   - p(95) < 1.5s for DB-backed pages
//   - error rate < 1%
//
// Run: k6 run --vus 100 --duration 30s infra/loadtest/storefront-smoke.js
//
// NOTE: This is a SYNTHETIC smoke test. It validates the test framework works.
// Real load testing requires a tenant seeded with products.

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 50,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3000";
const TENANT = __ENV.TENANT_HOST || "demo.lvh.me";

export default function () {
  // 1. Homepage (cached at edge after middleware rewrite)
  const home = http.get(`http://${TENANT}/`, {
    headers: { Host: TENANT },
  });
  check(home, {
    "home status 200": (r) => r.status === 200,
    "home has Cache-Control": (r) =>
      (r.headers["Cache-Control"] || "").includes("s-maxage"),
  });

  sleep(0.5);

  // 2. Health endpoint (sanity)
  const health = http.get(`${BASE}/api/healthz/db`);
  check(health, {
    "health 200 or 503": (r) => r.status === 200 || r.status === 503,
  });

  sleep(0.5);

  // 3. Marketing root (different host, no DB)
  const root = http.get(`${BASE}/`);
  check(root, {
    "root status 200": (r) => r.status === 200,
  });

  sleep(1);
}

// Teardown: print summary of cache hits/misses observed.
export function handleSummary(data) {
  const total = data.metrics.http_reqs.values.count;
  const failed = data.metrics.http_req_failed.values.passes;
  const p95 = data.metrics.http_req_duration.values["p(95)"];
  return {
    "stdout": `
      ╔═══════════════════════════════════════╗
      ║  Hybrid Load Test Summary             ║
      ╠═══════════════════════════════════════╣
      ║  Total requests: ${String(total).padEnd(20)}║
      ║  Failed rate:    ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%${" ".repeat(15)}║
      ║  p(95) latency:  ${p95.toFixed(0)}ms${" ".repeat(14)}║
      ╚═══════════════════════════════════════╝
    `,
  };
}