// GET /api/healthz/auth
//
// Login/signup health probe. Verifies the ENTIRE auth dependency chain is
// intact, because login is the highest-stakes user-facing flow and a silent
// regression breaks every platform admin / tenant owner / customer.
//
// Probes (in order, all in parallel where it makes sense):
//   1. ENV: AUTH_PROVIDER is set to a known value (supabase | password | dev)
//   2. ENV: when AUTH_PROVIDER=supabase, SUPABASE_URL/ANON_KEY/SERVICE_ROLE are set
//   3. DNS: supabase-kong hostname resolves from inside the container
//      (catches "hybrid-web not on Supabase network" — the silent failure mode
//       that previously made login return a generic 401 with no useful log)
//   4. TCP: can open a TCP connection to supabase-kong:8000
//   5. PROTOCOL: GoTrue's /auth/v1/health endpoint returns 200 (GoTrue's own liveness)
//   6. PROTOCOL: GoTrue accepts our ANON key (POST /auth/v1/token with deliberately
//      wrong creds → expect 400 invalid_credentials, NOT 401 unauthorized which
//      would mean our key is bad)
//
// No real user credentials are sent — the probe only validates the connection
// and that GoTrue recognizes our project key.
//
// Response codes:
//   200 → all 6 probes ok
//   503 → at least one probe failed; `checks` array says which
//
// Always fast-fails; never throws to caller. Safe to wire as a Docker healthcheck.

import { NextResponse } from "next/server";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROBE_TIMEOUT_MS = 2500;

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
  latencyMs: number;
};

function timed<T>(p: Promise<T>, timeoutMs: number): Promise<{ value: T | null; timedOut: boolean }> {
  return Promise.race([
    p.then((v) => ({ value: v, timedOut: false })),
    new Promise<{ value: null; timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ value: null, timedOut: true }), timeoutMs),
    ),
  ]);
}

async function checkEnv(): Promise<CheckResult> {
  const t0 = performance.now();
  const provider = process.env.AUTH_PROVIDER;
  const known = new Set(["supabase", "password", "dev"]);
  if (!provider) {
    return { name: "env", ok: false, detail: "AUTH_PROVIDER not set", latencyMs: 0 };
  }
  if (!known.has(provider)) {
    return { name: "env", ok: false, detail: `AUTH_PROVIDER=${provider} not in {supabase,password,dev}`, latencyMs: 0 };
  }
  if (provider === "supabase") {
    const missing = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter(
      (k) => !process.env[k],
    );
    if (missing.length) {
      return {
        name: "env",
        ok: false,
        detail: `AUTH_PROVIDER=*** but missing: ${missing.join(",")}`,
        latencyMs: 0,
      };
    }
  }
  return { name: "env", ok: true, detail: `AUTH_PROVIDER=${provider}`, latencyMs: Math.round(performance.now() - t0) };
}

async function checkDns(url: string): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    const u = new URL(url);
    const host = u.hostname;
    const r = await timed(dnsLookup(host), PROBE_TIMEOUT_MS);
    if (r.timedOut) {
      return { name: "dns", ok: false, detail: `${host} DNS timed out (network attach missing?)`, latencyMs: PROBE_TIMEOUT_MS };
    }
    if (!r.value) {
      return { name: "dns", ok: false, detail: `${host} did not resolve`, latencyMs: Math.round(performance.now() - t0) };
    }
    return {
      name: "dns",
      ok: true,
      detail: `${host} → ${r.value.address}`,
      latencyMs: Math.round(performance.now() - t0),
    };
  } catch (err) {
    return {
      name: "dns",
      ok: false,
      detail: `DNS lookup failed: ${(err as Error).message}`,
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

async function checkTcp(url: string): Promise<CheckResult> {
  const t0 = performance.now();
  const u = new URL(url);
  const host = u.hostname;
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  const result = await new Promise<{ ok: boolean; err?: string }>((resolve) => {
    const sock = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok: boolean, err?: string) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve({ ok, err });
    };
    sock.once("connect", () => finish(true));
    sock.once("error", (e) => finish(false, e.message));
    setTimeout(() => finish(false, "timeout"), PROBE_TIMEOUT_MS);
  });
  if (!result.ok) {
    return {
      name: "tcp",
      ok: false,
      detail: `${host}:${port} ${result.err ?? "unreachable"}`,
      latencyMs: Math.round(performance.now() - t0),
    };
  }
  return { name: "tcp", ok: true, detail: `${host}:${port} open`, latencyMs: Math.round(performance.now() - t0) };
}

async function checkGotrue(url: string, anonKey: string): Promise<CheckResult> {
  const t0 = performance.now();
  // GoTrue's /auth/v1/health — exists and returns 200 when GoTrue is alive.
  // If our ANON key were wrong we'd still get 200 (it's a public health endpoint),
  // so we ALSO send a token request with deliberately wrong creds → 400 invalid_credentials
  // is the "good" signal (GoTrue recognises our key, just not the fake user).
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const healthRes = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (healthRes.status !== 200) {
      return {
        name: "gotrue",
        ok: false,
        detail: `/auth/v1/health returned ${healthRes.status}`,
        latencyMs: Math.round(performance.now() - t0),
      };
    }
    // Probe credential path: send obviously-bad creds. Expect 400.
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), PROBE_TIMEOUT_MS);
    const credRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `healthz-probe-${Date.now()}@invalid.local`,
        password: "healthz-probe-deliberately-wrong",
      }),
      signal: ctrl2.signal,
    });
    clearTimeout(timer2);
    if (credRes.status === 400) {
      return {
        name: "gotrue",
        ok: true,
        detail: "/auth/v1/health=200, cred-probe=400 (key accepted, no user match as expected)",
        latencyMs: Math.round(performance.now() - t0),
      };
    }
    if (credRes.status === 401) {
      return {
        name: "gotrue",
        ok: false,
        detail: "ANON_KEY rejected (401) — SUPABASE_ANON_KEY wrong or project mismatch",
        latencyMs: Math.round(performance.now() - t0),
      };
    }
    return {
      name: "gotrue",
      ok: false,
      detail: `cred-probe unexpected ${credRes.status}`,
      latencyMs: Math.round(performance.now() - t0),
    };
  } catch (err) {
    return {
      name: "gotrue",
      ok: false,
      detail: `GoTrue probe failed: ${(err as Error).message}`,
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const checks: CheckResult[] = [];

  // 1. ENV (synchronous, always runs first)
  checks.push(await checkEnv());

  // If ENV is broken, no point probing deeper — but still run them so the
  // failure report is complete in one round-trip.
  const provider = process.env.AUTH_PROVIDER;
  const url = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";

  if (provider === "supabase" && url) {
    checks.push(await checkDns(url));
    checks.push(await checkTcp(url));
    checks.push(await checkGotrue(url, anonKey));
  } else if (provider === "supabase") {
    checks.push({
      name: "dns",
      ok: false,
      detail: "skipped: SUPABASE_URL empty",
      latencyMs: 0,
    });
    checks.push({
      name: "tcp",
      ok: false,
      detail: "skipped: SUPABASE_URL empty",
      latencyMs: 0,
    });
    checks.push({
      name: "gotrue",
      ok: false,
      detail: "skipped: SUPABASE_URL empty",
      latencyMs: 0,
    });
  }

  const ok = checks.every((c) => c.ok);
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      authProvider: provider,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}