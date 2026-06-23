// Auth seam. Two providers sit behind ONE getSession() signature, selected by
// the AUTH_PROVIDER env var:
//
//   AUTH_PROVIDER=dev      (DEFAULT) — HMAC-signed dev-login cookie. Local-first;
//                                      needs NO Supabase. UNCHANGED from P0.
//   AUTH_PROVIDER=supabase           — @supabase/ssr getUser() → app_user lookup.
//                                      Activated on Docker (`supabase start`) or
//                                      a Supabase cloud project.
//
// Callers stay identical: both return Session{userId, tenantId}. The supabase
// branch is import-safe — @supabase/ssr is only loaded (dynamic import) when
// AUTH_PROVIDER=supabase, so local dev never needs the package or its env vars.
//
// Dev cookie format: "<userId>.<hmac>" where hmac = HMAC-SHA256(userId, secret).
// We RECOMPUTE the HMAC and constant-time compare before trusting the userId —
// the signature, not the UUID shape, is what authenticates the session.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export interface Session {
  userId: string;
  tenantId: string | null;
}

export const DEV_SESSION_COOKIE = "hybrid_dev_session";

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
// local HMAC dev-login path — local dev needs no Supabase config.
export async function getSession(): Promise<Session | null> {
  if (process.env.AUTH_PROVIDER === "supabase") {
    return getSupabaseSession();
  }
  return getDevSession();
}

async function getDevSession(): Promise<Session | null> {
  // Dev auth is disabled in production; never trust this cookie there.
  if (process.env.NODE_ENV === "production") return null;

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

// Supabase provider. getUser() (NOT getSession) is used deliberately: it
// revalidates the JWT against the auth server instead of trusting an unverified
// cookie. The auth user id IS the app_user id (the on_auth_user_created trigger
// guarantees the row exists), and the active tenant is the user's owner/admin
// membership — looked up via asPlatformAdmin (membership lookup spans tenants,
// so it cannot run under a single-tenant withTenant context).
//
// @supabase/ssr is imported dynamically so the dev branch never pulls it in and
// missing SUPABASE_* env vars cannot crash a dev-only deployment.
async function getSupabaseSession(): Promise<Session | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "AUTH_PROVIDER=supabase requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const { createServerClient } = await import("@supabase/ssr");
  const store = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      // In a Server Component the cookie store is read-only; token refresh is
      // performed by middleware (supabase branch only). Swallowing the write
      // here is the documented @supabase/ssr pattern.
      setAll() {
        /* no-op: handled by middleware on the supabase branch */
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  // app_user.id = auth.users.id. Resolve the active tenant from membership
  // (owner first, then admin). tenantId stays null if the user has provisioned
  // no store yet — callers pair identity with the host-resolved tenant.
  const tenantId = await resolveActiveTenantId(user.id);
  return { userId: user.id, tenantId };
}

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
