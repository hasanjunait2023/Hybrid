// Vercel Domains API client (blueprint §2.1). LOCAL-FIRST + flag-gated:
//
//   VERCEL_DOMAINS_ENABLED=false  (default) — the data model, state machine, and
//   UI all work; the live Vercel calls are stubbed-as-PENDING. This is NOT
//   fake-success: addDomain returns { live: false } so the caller persists the
//   row + DNS instructions and the seller sees an honest "pending live Vercel"
//   state. verify/status return `pending` so the state machine never advances to
//   verified/issued without a real signal.
//
//   VERCEL_DOMAINS_ENABLED=true — real REST calls (Pro plan + token required):
//     POST   /v10/projects/{projectId}/domains          (add)
//     POST   /v9/projects/{projectId}/domains/{d}/verify (verify TXT/CNAME)
//     GET    /v9/projects/{projectId}/domains/{d}        (status: verified)
//     GET    /v6/domains/{d}/config                      (misconfigured flag)
//
// No secrets are logged. The token is read from env at call time only.
import "server-only";

const API_BASE = "https://api.vercel.com";

export interface VercelResult {
  /** false when the flag is off — caller persists row but does NOT advance state. */
  live: boolean;
  /** Live verification outcome (only meaningful when live === true). */
  verified?: boolean;
  /** Live SSL/cert outcome. */
  sslIssued?: boolean;
  /** A user-facing reason on failure (Bengali-mappable by the caller). */
  reason?: string;
}

function isEnabled(): boolean {
  return process.env.VERCEL_DOMAINS_ENABLED === "true";
}

function config(): { token: string; projectId: string; teamQuery: string } | null {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  const team = process.env.VERCEL_TEAM_ID?.trim();
  return { token, projectId, teamQuery: team ? `?teamId=${encodeURIComponent(team)}` : "" };
}

async function call(
  path: string,
  init: RequestInit & { teamQuery: string; token: string },
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`${API_BASE}${path}${init.teamQuery}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
    },
    body: init.body,
    cache: "no-store",
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

/** Add the domain to the Vercel project. Flag-off → pending (live: false). */
export async function addDomain(domain: string): Promise<VercelResult> {
  if (!isEnabled()) return { live: false };
  const cfg = config();
  if (!cfg) return { live: false, reason: "Vercel API কনফিগার করা নেই।" };

  const r = await call(`/v10/projects/${cfg.projectId}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
    teamQuery: cfg.teamQuery,
    token: cfg.token,
  });
  // 409 = already added to this project; treat as added (idempotent).
  if (!r.ok && r.status !== 409) {
    return { live: true, verified: false, reason: errorReason(r.json) };
  }
  const verified = readVerified(r.json);
  return { live: true, verified };
}

/** Trigger Vercel's TXT/CNAME verification. Flag-off → pending. */
export async function verifyDomain(domain: string): Promise<VercelResult> {
  if (!isEnabled()) return { live: false };
  const cfg = config();
  if (!cfg) return { live: false, reason: "Vercel API কনফিগার করা নেই।" };

  const r = await call(`/v9/projects/${cfg.projectId}/domains/${domain}/verify`, {
    method: "POST",
    teamQuery: cfg.teamQuery,
    token: cfg.token,
  });
  if (!r.ok) return { live: true, verified: false, reason: errorReason(r.json) };
  return { live: true, verified: readVerified(r.json) };
}

/** Poll verified + SSL/cert status. Flag-off → pending. */
export async function getDomainStatus(domain: string): Promise<VercelResult> {
  if (!isEnabled()) return { live: false };
  const cfg = config();
  if (!cfg) return { live: false, reason: "Vercel API কনফিগার করা নেই।" };

  const r = await call(`/v9/projects/${cfg.projectId}/domains/${domain}`, {
    method: "GET",
    teamQuery: cfg.teamQuery,
    token: cfg.token,
  });
  if (!r.ok) return { live: true, verified: false, reason: errorReason(r.json) };
  const verified = readVerified(r.json);
  // On Vercel for Platforms a verified, non-misconfigured domain has its cert
  // auto-provisioned; the project domain GET exposes `verified` but cert state
  // lives behind the config endpoint. We treat verified && !misconfigured as
  // issued; a separate config check refines `misconfigured`.
  const cfgRes = await call(`/v6/domains/${domain}/config`, {
    method: "GET",
    teamQuery: cfg.teamQuery,
    token: cfg.token,
  });
  const misconfigured = readMisconfigured(cfgRes.json);
  return { live: true, verified, sslIssued: verified && !misconfigured };
}

// ---- response readers (defensive; Vercel shapes vary by endpoint) -----------

function readVerified(json: unknown): boolean {
  if (json && typeof json === "object" && "verified" in json) {
    return Boolean((json as { verified?: unknown }).verified);
  }
  return false;
}

function readMisconfigured(json: unknown): boolean {
  if (json && typeof json === "object" && "misconfigured" in json) {
    return Boolean((json as { misconfigured?: unknown }).misconfigured);
  }
  // Unknown shape → assume misconfigured (fail-closed: don't claim live).
  return true;
}

function errorReason(json: unknown): string {
  if (json && typeof json === "object" && "error" in json) {
    const err = (json as { error?: { message?: string; code?: string } }).error;
    if (err?.code === "missing_txt_record") return "TXT রেকর্ড পাওয়া যায়নি।";
    if (err?.message) return err.message;
  }
  return "Vercel যাচাই ব্যর্থ — DNS রেকর্ড আবার দেখুন।";
}
