// Auth seam (Phase 0 stub, not throwaway). Phase 1 swaps the body for a
// Supabase session lookup; callers stay unchanged.
//
// P0: reads the dev cookie `hybrid_dev_session` set by /dev-login?as=...
// The cookie holds the seeded app_user id. The active tenantId is resolved at
// the request boundary (middleware/layout) and passed to withTenant separately;
// here we surface only what the session itself carries.
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

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const userId = parseDevCookie(raw);
  if (!userId) return null;

  // tenantId is determined per-request by host resolution / membership; the dev
  // session itself only asserts identity. Callers pair this with the resolved
  // tenant before calling withTenant().
  return { userId, tenantId: null };
}

// Dev cookie format: "<userId>.<sig>" where sig = HMAC base of userId.
// Real signing lives in /dev-login route; here we only validate shape and trust
// the route's signature (dev-only; NODE_ENV guarded at the route).
function parseDevCookie(raw: string): string | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = raw.slice(0, dot);
  // basic UUID shape check; full HMAC verification is in the route on issue.
  return /^[0-9a-f-]{36}$/i.test(userId) ? userId : null;
}
