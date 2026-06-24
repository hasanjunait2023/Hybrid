// ============================================================================
// Own-auth session suite (SHIFT 1 / S-AUTH-CORE).
//
// Exercises createSession / getSession / revokeSession / destroySession against
// the real embedded Postgres (06_own_auth.sql) and the in-memory next/headers
// cookie stub. Proves the opaque token is hashed at rest, the cookie is the only
// place the raw token lives, getSession resolves identity + active tenant, and
// revoke/destroy are instant + fail-closed.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { asPlatformAdmin } from "../src/index";

process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";

import {
  createSession,
  getSession,
  revokeSession,
  destroySession,
  SESSION_COOKIE,
} from "../../../apps/web/lib/auth/session";
import { createAppUser } from "../../../apps/web/lib/auth/provision";
// The stub (aliased for "next/headers") exposes test helpers.
import { __getCookie, __clearCookies } from "./next-headers-stub";

const RUN = Date.now().toString(36);
const EMAIL = `session-${RUN}@auth.test`;
const SLUG = `sess-${RUN}`;
let userId: string;

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${SLUG}`;
    await tx`delete from app_user where email = ${EMAIL}`;
  });
}

describe("own auth — sessions", () => {
  // Pin the password provider at execution time so getSession() takes the
  // own-auth branch regardless of other test files' env. Restored after.
  let prevAuthProvider: string | undefined;
  beforeAll(async () => {
    prevAuthProvider = process.env.AUTH_PROVIDER;
    process.env.AUTH_PROVIDER = "password";
    __clearCookies();
    await cleanup();
    const u = await createAppUser({ email: EMAIL, fullName: "Session User" });
    userId = u.userId;
  });

  afterAll(async () => {
    if (prevAuthProvider === undefined) delete process.env.AUTH_PROVIDER;
    else process.env.AUTH_PROVIDER = prevAuthProvider;
    __clearCookies();
    await cleanup();
  });

  it("1. createSession stores only the SHA-256 hash, never the raw token", async () => {
    const raw = await createSession(userId, { ip: "1.2.3.4", userAgent: "vitest" });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    // The cookie holds the raw token …
    expect(__getCookie(SESSION_COOKIE)).toBe(raw);
    // … but the DB row holds its hash, and NOT the raw token.
    const rows = await asPlatformAdmin((tx) =>
      tx<{ token_hash: string; user_id: string }[]>`
        select token_hash, user_id from user_session where user_id = ${userId}
      `,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(rows[0]!.token_hash).not.toBe(raw);
  });

  it("2. getSession (password provider) resolves the user from the cookie", async () => {
    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(userId);
    // No membership yet → active tenant is null (identity still asserted).
    expect(session!.tenantId).toBeNull();
  });

  it("3. revokeSession makes the next getSession return null (instant revocation)", async () => {
    const raw = __getCookie(SESSION_COOKIE)!;
    await revokeSession(raw);
    const session = await getSession();
    expect(session).toBeNull();
    // Row is kept for audit with revoked_at set (not hard-deleted).
    const rows = await asPlatformAdmin((tx) =>
      tx<{ revoked_at: string | null }[]>`
        select revoked_at from user_session where user_id = ${userId}
      `,
    );
    expect(rows[0]!.revoked_at).not.toBeNull();
  });

  it("4. expired session is not returned", async () => {
    const raw = await createSession(userId);
    // Force-expire the row.
    await asPlatformAdmin((tx) =>
      tx`update user_session set expires_at = now() - interval '1 hour'
          where token_hash = ${createHash("sha256").update(raw).digest("hex")}`,
    );
    expect(await getSession()).toBeNull();
  });

  it("5. destroySession revokes + clears the cookie (idempotent)", async () => {
    await createSession(userId);
    expect(__getCookie(SESSION_COOKIE)).toBeTruthy();
    await destroySession();
    expect(__getCookie(SESSION_COOKIE)).toBeUndefined();
    expect(await getSession()).toBeNull();
    // Second destroy with no cookie is a no-op (does not throw).
    await expect(destroySession()).resolves.toBeUndefined();
  });

  it("6. a forged/unknown cookie yields no session (fail-closed)", async () => {
    __clearCookies();
    // Plant a random cookie that was never minted.
    const { __setCookie } = await import("./next-headers-stub");
    __setCookie(SESSION_COOKIE, "totally-made-up-token");
    expect(await getSession()).toBeNull();
  });
});
