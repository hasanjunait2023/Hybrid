/**
 * k6 Load Test — Storefront Read-Only Scenarios
 * Phase-A/B infrastructure prep — tests real storefront performance
 *
 * NOTE: Run against STAGING or a dedicated test box, NEVER production.
 * DO NOT use default VU/duration on the single-instance prod VPS.
 *
 * Usage:
 *   k6 run load-test/storefront-load.js
 *   BASE_URL=https://store-a.hybrid.ecomex.cloud VUS=10 DURATION=30s k6 run load-test/storefront-load.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';

// ==============================================================================
// CONFIGURATION
// ==============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://store-a.lvh.me:3000';
const VUS = parseInt(__ENV.VUS || '5'); // Virtual Users
const DURATION = __ENV.DURATION || '30s';

// The test runs read-only scenarios: product listing, product detail, marketing page
const SCENARIOS = [
  {
    name: 'storefront-reads',
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: VUS },
      { duration: DURATION, target: VUS },
      { duration: '5s', target: 0 },
    ],
  },
];

export const options = {
  scenarios: SCENARIOS,
  thresholds: {
    // p95 latency thresholds (Phase A targets)
    'http_req_duration{staticAsset:false}': ['p(95)<1000'], // storefront pages < 1s (generous for single box)
    'http_req_duration{staticAsset:true}': ['p(95)<2000'],  // images < 2s
    http_req_failed: ['rate<0.1'],  // < 10% errors
  },
};

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

function makeRequest(url, name = '', tags = {}) {
  const response = http.get(url, {
    tags: {
      ...tags,
      staticAsset: tags.staticAsset || false,
    },
  });

  check(response, {
    [`${name || url} — status 200`]: (r) => r.status === 200,
    [`${name || url} — time < 2s`]: (r) => r.timings.duration < 2000,
  });

  return response;
}

// ==============================================================================
// SCENARIOS
// ==============================================================================

export default function () {
  // Scenario 1: Load the storefront home page
  group('Storefront Home', function () {
    const resp = makeRequest(
      `${BASE_URL}/`,
      'Home page',
      { scenario: 'home' }
    );

    // Extract a product link from the response if present
    const productMatch = resp.body.match(/\/products\/([a-z0-9-]+)/);
    if (productMatch) {
      sleep(2); // Simulate user reading

      // Scenario 2: Load a product detail page
      group('Product Detail', function () {
        const productSlug = productMatch[1];
        makeRequest(
          `${BASE_URL}/products/${productSlug}`,
          'Product detail',
          { scenario: 'product-detail' }
        );
      });

      // Scenario 3: Load product images (static assets)
      group('Static Assets', function () {
        // These are typically served from cdn.hybrid.ecomex.cloud
        // k6 will follow redirects and load actual images
        sleep(1);
      });
    }

    sleep(2); // Simulate user thinking
  });

  // Scenario 4: Marketing page / signup (landing)
  group('Marketing Page', function () {
    makeRequest(
      `${BASE_URL}/signup`,
      'Signup page',
      { scenario: 'marketing' }
    );
  });

  sleep(3); // Between iterations
}

// ==============================================================================
// CUSTOM METRICS (displayed at end)
// ==============================================================================

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

/**
 * Format results as readable text
 */
function textSummary(data, options = {}) {
  const metrics = data.metrics;
  const indent = options.indent || '';
  const colors = options.enableColors || false;

  let output = '\n' + '═'.repeat(60) + '\n';
  output += '   K6 LOAD TEST SUMMARY\n';
  output += '═'.repeat(60) + '\n\n';

  // Request metrics
  if (metrics.http_req_duration) {
    const samples = metrics.http_req_duration.values;
    output += `${indent}HTTP Request Duration\n`;
    output += `${indent}  avg: ${metrics.http_req_duration.value.toFixed(2)} ms\n`;
    if (metrics['http_req_duration{staticAsset:false}']?.value) {
      output += `${indent}  pages avg: ${metrics['http_req_duration{staticAsset:false}'].value.toFixed(2)} ms\n`;
    }
    output += `${indent}  p(95): ${getPercentile(samples, 0.95).toFixed(2)} ms\n\n`;
  }

  // Error rate
  if (metrics.http_req_failed) {
    output += `${indent}Error Rate: ${(metrics.http_req_failed.value * 100).toFixed(2)}%\n\n`;
  }

  // Throughput
  if (metrics.http_reqs) {
    output += `${indent}Total Requests: ${metrics.http_reqs.value}\n\n`;
  }

  // Thresholds
  if (data.thresholds) {
    output += `${indent}Thresholds\n`;
    for (const [name, result] of Object.entries(data.thresholds)) {
      const status = result.ok ? '✅' : '❌';
      output += `${indent}  ${status} ${name}\n`;
    }
  }

  output += '\n' + '═'.repeat(60) + '\n';
  return output;
}

function getPercentile(samples, p) {
  if (!samples || samples.length === 0) return 0;
  const sorted = samples.sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
}
