#!/usr/bin/env node
/**
 * hybrid-preflight.mjs
 *
 * Runs BEFORE `next start` inside the production container. Hard-fails the
 * process (exit 1) if any of the following are broken — these are exactly the
 * failure modes that caused the 2026-07-01 P0 login outage (3 stacked bugs):
 *
 *   1. Required env vars are missing (AUTH_PROVIDER + the matching trio)
 *   2. AUTH_PROVIDER has an unexpected value (typo guard)
 *   3. AUTH_PROVIDER=supabase but SUPABASE_URL/Kong hostname doesn't resolve
 *      (catches: hybrid-web not on the Supabase Docker network)
 *   4. SUPABASE_URL port is unreachable (catches: wrong port, firewall)
 *   5. GoTrue health endpoint doesn't return 200
 *
 * Output goes to stderr so it shows up in `docker logs hybrid-web` and gets
 * picked up by Sentry/GlitchTip if added later. Exit 1 = container crashloops,
 * which Docker shows via `docker ps --filter "health=unhealthy"` or by
 * container restart count — both loud signals, not silent.
 *
 * Designed to add <2s to container startup. No external deps — pure Node stdlib.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

const PROVIDERS = new Set(["supabase", "password", "dev"]);

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const failures = [];
const warnings = [];

function fail(msg) {
  failures.push(msg);
  console.error(`${RED}${BOLD}✗${RESET} ${msg}`);
}
function warn(msg) {
  warnings.push(msg);
  console.error(`${YELLOW}!${RESET} ${msg}`);
}
function ok(msg) {
  console.error(`${GREEN}✓${RESET} ${msg}`);
}

function banner() {
  console.error(`${BOLD}─── hybrid-web preflight ───${RESET}`);
}

// --- 1. ENV checks ------------------------------------------------------
function checkEnv() {
  const provider = process.env.AUTH_PROVIDER;
  if (!provider) {
    fail("AUTH_PROVIDER is not set. Add to .env.deploy and interpolate via ${AUTH_PROVIDER} in docker-compose.prod.yml");
    return;
  }
  if (!PROVIDERS.has(provider)) {
    fail(`AUTH_PROVIDER="${provider}" is not one of {supabase, password, dev}. Likely a typo.`);
    return;
  }
  ok(`AUTH_PROVIDER=${provider}`);

  // Provider-specific required vars
  if (provider === "supabase") {
    const needed = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
    const missing = needed.filter((k) => !process.env[k] || process.env[k].trim() === "");
    if (missing.length) {
      fail(`AUTH_PROVIDER=supabase but missing env: ${missing.join(", ")}. Add \${VAR} lines to docker-compose.prod.yml environment block.`);
    } else {
      ok(`SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY all set`);
    }
  }

  // Always-required regardless of provider (web app boots needs these)
  const coreNeeded = ["DATABASE_URL", "DIRECT_URL", "APP_ENCRYPTION_KEY", "SESSION_SECRET", "REDIS_URL"];
  const missingCore = coreNeeded.filter((k) => !process.env[k]);
  if (missingCore.length) {
    fail(`Missing core env: ${missingCore.join(", ")}`);
  } else {
    ok(`DATABASE_URL, DIRECT_URL, APP_ENCRYPTION_KEY, SESSION_SECRET, REDIS_URL all set`);
  }

  // AUTH_PROVIDER=dev is gated in prod by the code, but warn loudly if used in prod
  if (provider === "dev" && process.env.NODE_ENV === "production") {
    warn(`AUTH_PROVIDER=dev with NODE_ENV=production — dev sessions are prod-gated, login will return null`);
  }
}

// --- 2. Network / DNS checks (only when AUTH_PROVIDER=supabase) --------
async function checkNetwork() {
  if (process.env.AUTH_PROVIDER !== "supabase") return;
  const url = process.env.SUPABASE_URL;
  if (!url) return; // already failed in checkEnv

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`SUPABASE_URL is not a valid URL: ${url}`);
    return;
  }
  const host = parsed.hostname;
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));

  // DNS
  try {
    const t0 = Date.now();
    const r = await Promise.race([
      dnsLookup(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error("DNS timeout 2s")), 2000)),
    ]);
    ok(`DNS ${host} → ${r.address} (${Date.now() - t0}ms)`);
  } catch (e) {
    fail(
      `DNS lookup for ${host} failed: ${e.message}. ` +
        `Likely cause: hybrid-web is not attached to the Supabase Docker network. ` +
        `Fix: add 'networks: [hybrid_default, pe9o2li2n3bns3wnofob49uw]' under the web service in docker-compose.prod.yml, ` +
        `then redeclare both networks as external at the bottom of the file.`,
    );
    return; // skip further checks if DNS is broken
  }

  // TCP
  const tcpOk = await new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    let done = false;
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ ok, err });
    };
    sock.once("connect", () => finish(true));
    sock.once("error", (e) => finish(false, e.message));
    setTimeout(() => finish(false, "TCP timeout 2s"), 2000);
  });
  if (!tcpOk.ok) {
    fail(`TCP ${host}:${port} unreachable: ${tcpOk.err}. Wrong port? Container restarted?`);
    return;
  }
  ok(`TCP ${host}:${port} reachable`);

  // GoTrue health
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.status !== 200) {
      fail(`GoTrue /auth/v1/health returned ${res.status}. SUPABASE_URL or ANON_KEY may be wrong.`);
    } else {
      ok(`GoTrue /auth/v1/health = 200`);
    }
  } catch (e) {
    fail(`GoTrue probe failed: ${e.message}`);
  }
}

banner();
checkEnv();
await checkNetwork();

console.error(`${BOLD}─────────────────────────────${RESET}`);
if (failures.length === 0) {
  console.error(`${GREEN}${BOLD}✓ preflight passed${RESET} (${warnings.length} warning${warnings.length === 1 ? "" : "s"})`);
  console.error(`${BOLD}─── starting next ───────────${RESET}`);
  process.exit(0);
} else {
  console.error(`${RED}${BOLD}✗ preflight FAILED with ${failures.length} error${failures.length === 1 ? "" : "s"}${RESET}`);
  console.error(`${RED}Container will refuse to start. Fix the above and redeploy.${RESET}`);
  console.error(`${BOLD}─────────────────────────────${RESET}`);
  process.exit(1);
}