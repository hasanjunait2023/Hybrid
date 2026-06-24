// Auth seam. Two providers sit behind ONE getSession() signature, selected by
// the AUTH_PROVIDER env var:
//
//   AUTH_PROVIDER=dev      (DEFAULT) — HMAC-signed dev-login cookie. Local-first;
//                                      needs NO external services. UNCHANGED.
//   AUTH_PROVIDER=password           — own auth (SHIFT 1). Opaque DB-backed
//                                      session token in user_session, SHA-256
//                                      hashed at rest. Production default.
//
// Callers stay identical: both return Session{userId, tenantId}. The Supabase
// branch was REMOVED in Phase 2 (own auth replaces it).
//
// Dev cookie format: "<userId>.<hmac>" where hmac = HMAC-SHA256(userId, secret).
// We RECOMPUTE the HMAC and constant-time compare before trusting the userId —
// the signature, not the UUID shape, is what authenticates the session.
//
// Password cookie (hybrid_session): an opaque base64url(randomBytes(32)) token.
// We SHA-256 it and look up user_session by token_hash; the raw token is never
// stored. HttpOnly + Secure + SameSite=Lax (Lax required so the cookie rides
// admin.* / app.* subdomain navigation; Strict would break it).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export interface Session {
  userId: string;
  tenantId: string | null;
}

export const DEV_SESSION_COOKIE = "hybrid_dev_session";
export const SESSION_COOKIE = "hybrid_session";

// 7 days (research brief §Topic 2, GATE-1 #B). Overridable via env for ops.
const DEFAULT_SESSION_MAX_AGE_SECONDS = 604800;

function sessionMaxAgeSeconds(): number {
  const raw = process.env.SESSION_MAX_AGE_SECONDS;
  if (!raw) return DEFAULT_SESSION_MAX_AGE_SECONDS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

// Seeded dev identities (mirrors sql/03_seed.sql).
export const DEV_USERS = {
  "owner-a": "11111111-1111-1111-1111-111111111001",
  "owner-b": "11111111-1111-1111-1111-111111111002",
  admin: "11111111-1111-1111-1111-1111111110ff",
} as const;

// Fail-fast: no hardcoded fallback secret. Both the verifier (here) and the
// signer (/dev-login) call this, so an unset secret throws at first use rather
// than silently signing/verifying with a guessable literal.
export function devSessionSecret(): string {
  const secret = process.env.DEV_SESSION_SECRET;
  if (!secret) {
    throw new Error("DEV_SESSION_SECRET is not set (required for dev auth)");
  }
  return secret;
}

export function signDevCookie(userId: string): string {
  const sig = createHmac("sha256", devSessionSecret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

// Provider dispatch. Defaults to 'dev' so an unset AUTH_PROVIDER keeps the
// local HMAC dev-login path — local dev needs no external auth config.
export async function getSession(): Promise<Session | null> {
  if (process.env.AUTH_PROVIDER === "password") {
    return getPasswordSession();
  }
  return getDevSession();
}

async function getDevSession(): Promise<Session | null> {
  // Dev auth is disabled in production; never trust this cookie there.
  // Staging override: ALLOW_DEV_LOGIN=true re-enables dev-login on a deployed
  // (NODE_ENV=production) box for founder check/QA. Default OFF — real prod stays closed.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_LOGIN !== "true") return null;

  const store = await cookies();
  const raw = store.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const userId = verifyDevCookie(raw);
  if (!userId) return null;

  // tenantId is determined per-request by host resolution / membership; the dev
  // session itself only asserts identity. Callers pair this with the resolved
  // tenant before calling withTenant().
  return { userId, tenantId: null };
}

// --- Own-auth (password) provider ---------------------------------------------

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// Read the hybrid_session cookie, hash it, and resolve a live (unexpired,
// unrevoked) user_session via asPlatformAdmin. Cross-user lookup precedes tenant
// resolution, so it cannot run under a single-tenant withTenant context — the
// same rationale as resolveActiveTenantId. Returns null on any miss (fail-closed).
async function getPasswordSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const { asPlatformAdmin } = await import("@hybrid/db");
  const rows = await asPlatformAdmin((tx) =>
    tx<{ user_id: string }[]>`
      select user_id
        from user_session
       where token_hash = ${hashToken(raw)}
         and revoked_at is null
         and expires_at > now()
       limit 1
    `,
  );
  const userId = rows[0]?.user_id;
  if (!userId) return null;

  const tenantId = await resolveActiveTenantId(userId);
  return { userId, tenantId };
}

export interface SessionRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// Mint a new opaque session for `userId`, persist its SHA-256 hash, set the
// HttpOnly cookie, and return the raw token. The raw token is what the browser
// holds; the DB only ever sees the hash. Secure is on outside dev so the cookie
// never rides plain HTTP in production.
export async function createSession(
  userId: string,
  meta: SessionRequestMeta = {},
): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url"); // 256 bits entropy
  const tokenHash = hashToken(rawToken);
  const maxAge = sessionMaxAgeSeconds();

  const { asPlatformAdmin } = await import("@hybrid/db");
  await asPlatformAdmin(async (tx) => {
    await tx`
      insert into user_session (user_id, token_hash, expires_at, ip, user_agent)
      values (
        ${userId}, ${tokenHash},
        now() + ${`${maxAge} seconds`}::interval,
        ${meta.ip ?? null}, ${meta.userAgent ?? null}
      )
    `;
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
    domain: sessionCookieDomain(),
  });

  return rawToken;
}

// Revoke a session by its raw token (logout). Sets revoked_at so the row is kept
// for audit; the lookup in getPasswordSession filters on revoked_at is null.
// Idempotent — revoking an unknown/already-revoked token is a no-op.
export async function revokeSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  const { asPlatformAdmin } = await import("@hybrid/db");
  await asPlatformAdmin(async (tx) => {
    await tx`
      update user_session
         set revoked_at = now()
       where token_hash = ${hashToken(rawToken)}
         and revoked_at is null
    `;
  });
}

// Clear the session cookie and revoke the underlying row. Reads the current
// cookie, so call this from a Route Handler / Server Action with cookie access.
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) await revokeSession(raw);
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    domain: sessionCookieDomain(),
  });
}

// The session cookie is set on the parent domain (.{ROOT}) so it is readable
// across admin.* / app.* / store.* subdomains. In dev (lvh.me) and when the root
// is unset we omit domain so the host-only cookie still works locally.
function sessionCookieDomain(): string | undefined {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!root || root.includes("lvh.me") || root.includes("localhost")) return undefined;
  return `.${root}`;
}

// Resolve the user's active tenant from membership (owner first, then admin).
// Spans tenants, so it runs via asPlatformAdmin (cannot use a single-tenant
// withTenant context). Shared by the password provider; kept stable for callers.
async function resolveActiveTenantId(userId: string): Promise<string | null> {
  const { asPlatformAdmin } = await import("@hybrid/db");
  const rows = await asPlatformAdmin((tx) =>
    tx<{ tenant_id: string }[]>`
      select tenant_id
        from tenant_member
       where user_id = ${userId}
       order by case role when 'owner' then 0 when 'admin' then 1 else 2 end,
                created_at asc
       limit 1
    `,
  );
  return rows[0]?.tenant_id ?? null;
}

// Returns the userId only if the HMAC signature verifies. Constant-time compare
// prevents timing oracles; a forged cookie (no/invalid signature) yields null.
function verifyDevCookie(raw: string): string | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot >= raw.length - 1) return null;

  const userId = raw.slice(0, dot);
  const presented = raw.slice(dot + 1);

  let expected: string;
  try {
    expected = createHmac("sha256", devSessionSecret()).update(userId).digest("hex");
  } catch {
    return null;
  }

  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}
