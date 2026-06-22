// Auth seam (Phase 0 stub, not throwaway). Phase 1 swaps the body for a
// Supabase session lookup; callers stay unchanged.
//
// P0: reads the signed dev cookie `hybrid_dev_session` set by /dev-login?as=...
// The cookie is "<userId>.<hmac>" where hmac = HMAC-SHA256(userId, secret).
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

export async function getSession(): Promise<Session | null> {
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
