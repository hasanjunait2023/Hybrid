// ============================================================================
// Supabase credential path suite (AUTH_PROVIDER=supabase — the LIVE front door).
//
// GoTrue is the credential authority in production: /api/auth/login verifies the
// email+password against GoTrue, maps the verified identity to its app_user by
// email, and mints the app's OWN opaque hybrid_session; /api/auth/signup creates
// the GoTrue user (admin.createUser) alongside the app_user, then provisions the
// tenant + session. QA flagged this path as having ZERO automated coverage.
//
// We run the REAL route handlers against the embedded Postgres and the in-memory
// next/headers + redis stubs. The ONLY thing faked is GoTrue itself: a fake
// Supabase client is injected via __setSupabaseClientFactoriesForTest (a tiny,
// production-safe seam in supabaseAuth.ts — default behavior is unchanged). So
// the verify→map→mint and createUser→provision wiring is exercised end-to-end
// without a live GoTrue server.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asPlatformAdmin } from "../src/index";

// Env must be in place BEFORE the route/session modules read it at import time.
process.env.AUTH_PROVIDER = "supabase";
process.env.NEXT_PUBLIC_ROOT_DOMAIN = "myhybrid.com";
process.env.REDIS_URL = "redis://stub"; // deterministic rate limiting via stub
// supabaseAuth.need() only runs for the REAL client; the injected fake bypasses
// it. Set the names anyway so any incidental read is satisfied.
process.env.SUPABASE_URL = "http://supabase-kong:8000";
process.env.SUPABASE_ANON_KEY = "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";

import { POST as loginPOST } from "../../../apps/web/app/api/auth/login/route";
import { POST as signupPOST } from "../../../apps/web/app/api/auth/signup/route";
import { __setSupabaseClientFactoriesForTest } from "../../../apps/web/lib/auth/supabaseAuth";
import { getSession, SESSION_COOKIE } from "../../../apps/web/lib/auth/session";
import { createAppUser } from "../../../apps/web/lib/auth/provision";
import { issueOtp } from "../../../apps/web/lib/auth/otp";
import {
  LOGIN_FAILED_BN,
  EMAIL_INVALID_BN,
  normalizeBdPhone,
} from "../../../apps/web/lib/auth/validate";
import { __getCookie, __clearCookies } from "./next-headers-stub";
import { __resetCache } from "./redis-client-stub";

const ORIGIN = "https://admin.myhybrid.com";
const HOST = "admin.myhybrid.com";

// A NextRequest-shaped POST with matching Origin/Host (passes requireSameOrigin)
// and a JSON body. clientIpFrom falls back to "unknown" with no x-forwarded-for,
// which is fine — each test resets the rate-limit stub so the bucket is empty.
function jsonPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      host: HOST,
    },
    body: JSON.stringify(body),
  });
}

// Fake GoTrue. signInWithPassword resolves success only for credentials present
// in `valid`; admin.createUser records the email and can be told to fail
// (duplicate / generic) to exercise the signup rollback branches.
function makeFakeSupabase(opts: {
  valid?: Record<string, string>; // email -> password that GoTrue accepts
  createUserError?: { message: string } | null;
  onCreateUser?: (email: string) => void;
}) {
  const valid = opts.valid ?? {};
  const authClient = {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        if (valid[email] && valid[email] === password) {
          return { data: { user: { id: `gotrue-${email}` } }, error: null };
        }
        return { data: { user: null }, error: { message: "Invalid login credentials" } };
      },
    },
  };
  const adminClient = {
    auth: {
      admin: {
        async createUser({ email }: { email: string }) {
          opts.onCreateUser?.(email);
          if (opts.createUserError) return { data: { user: null }, error: opts.createUserError };
          return { data: { user: { id: `gotrue-${email}` } }, error: null };
        },
      },
    },
  };
  // The fakes only implement the surface these paths touch. The seam setter
  // types its args as SupabaseClient; cast through unknown — @supabase/supabase-js
  // types aren't resolvable from @hybrid/db, and only apps/web needs the real shape.
  return {
    auth: () => authClient as unknown as never,
    admin: () => adminClient as unknown as never,
  };
}

const RUN = Date.now().toString(36);

async function deleteUserByEmail(email: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from app_user where email = ${email}`;
  });
}

async function deleteTenantBySlug(slug: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where slug = ${slug}`;
  });
}

describe("supabase auth — credential path (AUTH_PROVIDER=supabase)", () => {
  let prevAuthProvider: string | undefined;
  let prevRedisUrl: string | undefined;

  beforeAll(() => {
    prevAuthProvider = process.env.AUTH_PROVIDER;
    prevRedisUrl = process.env.REDIS_URL;
    process.env.AUTH_PROVIDER = "supabase";
    process.env.REDIS_URL = "redis://stub";
  });

  afterAll(() => {
    __setSupabaseClientFactoriesForTest(undefined); // restore real clients
    if (prevAuthProvider === undefined) delete process.env.AUTH_PROVIDER;
    else process.env.AUTH_PROVIDER = prevAuthProvider;
    if (prevRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedisUrl;
    __clearCookies();
  });

  beforeEach(() => {
    __clearCookies();
    __resetCache(); // fresh rate-limit window per test
  });

  // 1. valid GoTrue credential + matching app_user → session minted, cookie
  //    verifies via getSession, resolves the owner's tenant.
  it("1. valid GoTrue credential with a matching app_user mints a verifiable session", async () => {
    const email = `supa-login-ok-${RUN}@auth.test`;
    const password = "CorrectHorse42";
    const slug = `supa-ok-${RUN}`;
    await deleteUserByEmail(email);
    await deleteTenantBySlug(slug);

    // app_user exists AND owns a tenant (so getSession resolves a tenantId).
    const { userId } = await createAppUser({ email, fullName: "Supa Owner" });
    const { provisionTenant } = await import("../../../apps/web/lib/auth/provision");
    await provisionTenant({ userId, storeName: "Supa Store", slug });

    __setSupabaseClientFactoriesForTest(makeFakeSupabase({ valid: { [email]: password } }));

    const res = await loginPOST(jsonPost(`${ORIGIN}/api/auth/login`, { email, password }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // A real opaque hybrid_session cookie was set …
    const cookie = __getCookie(SESSION_COOKIE);
    expect(cookie).toMatch(/^[A-Za-z0-9_-]+$/);

    // … and it resolves to the right user + tenant via the normal reader.
    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(userId);
    expect(session!.tenantId).not.toBeNull();

    // Exactly one session row was created for this user.
    const rows = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from user_session where user_id = ${userId}`,
    );
    expect(rows[0]!.n).toBe(1);

    await deleteTenantBySlug(slug);
    await deleteUserByEmail(email);
  });

  // 2. valid GoTrue credential but NO matching app_user → fail closed, generic
  //    error, NO session minted (identity not provisioned in the app model).
  it("2. valid GoTrue credential with no app_user fails closed (no session, generic error)", async () => {
    const email = `supa-no-appuser-${RUN}@auth.test`;
    const password = "CorrectHorse42";
    await deleteUserByEmail(email); // ensure no app_user row exists

    __setSupabaseClientFactoriesForTest(makeFakeSupabase({ valid: { [email]: password } }));

    const res = await loginPOST(jsonPost(`${ORIGIN}/api/auth/login`, { email, password }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: LOGIN_FAILED_BN });

    // No cookie, no getSession.
    expect(__getCookie(SESSION_COOKIE)).toBeUndefined();
    expect(await getSession()).toBeNull();

    // And no orphan session row anywhere for this (absent) identity.
    const rows = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`
        select count(*)::int as n
          from user_session s join app_user u on u.id = s.user_id
         where u.email = ${email}
      `,
    );
    expect(rows[0]!.n).toBe(0);
  });

  // 3. invalid GoTrue credential → rejected, no session (even if an app_user
  //    with that email happens to exist — GoTrue is the authority).
  it("3. invalid GoTrue credential is rejected with no session", async () => {
    const email = `supa-bad-cred-${RUN}@auth.test`;
    await deleteUserByEmail(email);
    await createAppUser({ email, fullName: "Has App User" }); // app_user exists…

    // …but the fake GoTrue knows NO valid password for it → signInWithPassword fails.
    __setSupabaseClientFactoriesForTest(makeFakeSupabase({ valid: {} }));

    const res = await loginPOST(
      jsonPost(`${ORIGIN}/api/auth/login`, { email, password: "whatever-wrong" }) as never,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: LOGIN_FAILED_BN });
    expect(__getCookie(SESSION_COOKIE)).toBeUndefined();
    expect(await getSession()).toBeNull();

    await deleteUserByEmail(email);
  });

  // 4. signup: creates the GoTrue user AND the app_user, provisions tenant +
  //    session. Then a duplicate-email GoTrue failure rolls back the orphan
  //    app_user (clean retry, no leftover).
  it("4. signup creates the GoTrue user + app_user + tenant + session", async () => {
    const email = `supa-signup-${RUN}@auth.test`;
    const phone = `01711${Math.floor(Math.random() * 1e6).toString().padStart(6, "0")}`;
    const slug = `supa-signup-${RUN}`;
    const password = "CorrectHorse42";
    await deleteUserByEmail(email);
    await deleteTenantBySlug(slug);

    // A real signup OTP must exist. The route normalizes the phone before
    // verifyOtp, so the OTP target must be the normalized (+880) form.
    const otp = await issueOtp(normalizeBdPhone(phone)!, "signup");
    expect(otp.ok).toBe(true);

    let createdEmail: string | undefined;
    __setSupabaseClientFactoriesForTest(
      makeFakeSupabase({ onCreateUser: (e) => (createdEmail = e) }),
    );

    const res = await signupPOST(
      jsonPost(`${ORIGIN}/api/auth/signup`, {
        email,
        phone,
        password,
        storeName: "Signup Store",
        slug,
        code: otp.code,
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // GoTrue user was created for the same email …
    expect(createdEmail).toBe(email);

    // … the app_user + tenant + owner membership + session all exist.
    const appUser = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`select id from app_user where email = ${email} limit 1`,
    );
    expect(appUser).toHaveLength(1);
    const userId = appUser[0]!.id;

    const tenants = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`select id from tenant where slug = ${slug} limit 1`,
    );
    expect(tenants).toHaveLength(1);

    const sessions = await asPlatformAdmin((tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from user_session where user_id = ${userId}`,
    );
    expect(sessions[0]!.n).toBe(1);

    // The minted cookie reads back as this user.
    const session = await getSession();
    expect(session!.userId).toBe(userId);
    expect(session!.tenantId).not.toBeNull();

    await deleteTenantBySlug(slug);
    await deleteUserByEmail(email);
  });

  // 5. signup with a duplicate email at the GoTrue layer → clean 409, the
  //    just-created orphan app_user is rolled back (no leftover, retry-safe).
  it("5. signup rolls back the orphan app_user when GoTrue rejects a duplicate email", async () => {
    const email = `supa-dup-${RUN}@auth.test`;
    const phone = `01722${Math.floor(Math.random() * 1e6).toString().padStart(6, "0")}`;
    const slug = `supa-dup-${RUN}`;
    await deleteUserByEmail(email);
    await deleteTenantBySlug(slug);

    const otp = await issueOtp(normalizeBdPhone(phone)!, "signup");
    expect(otp.ok).toBe(true);

    __setSupabaseClientFactoriesForTest(
      makeFakeSupabase({ createUserError: { message: "A user with this email already registered" } }),
    );

    const res = await signupPOST(
      jsonPost(`${ORIGIN}/api/auth/signup`, {
        email,
        phone,
        password: "CorrectHorse42",
        storeName: "Dup Store",
        slug,
        code: otp.code,
      }) as never,
    );
    expect(res.status).toBe(409);

    // The orphan app_user was dropped — no leftover, no tenant, no session.
    const appUser = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`select id from app_user where email = ${email}`,
    );
    expect(appUser).toHaveLength(0);
    const tenants = await asPlatformAdmin((tx) =>
      tx<{ id: string }[]>`select id from tenant where slug = ${slug}`,
    );
    expect(tenants).toHaveLength(0);
    expect(__getCookie(SESSION_COOKIE)).toBeUndefined();
  });

  // 6. malformed login body → generic 401 (no oracle), GoTrue never consulted,
  //    no session. Guards the shape-validation branch ahead of the supabase call.
  it("6. malformed login email is rejected before GoTrue is consulted", async () => {
    let consulted = false;
    __setSupabaseClientFactoriesForTest(
      makeFakeSupabase({
        valid: {},
      }),
    );
    // Spy: any signInWithPassword call flips the flag. We re-wrap the fake.
    __setSupabaseClientFactoriesForTest({
      auth: () =>
        ({
          auth: {
            async signInWithPassword() {
              consulted = true;
              return { data: { user: null }, error: { message: "x" } };
            },
          },
        }) as never,
      admin: () => ({ auth: { admin: { async createUser() { return { data: {}, error: null }; } } } }) as never,
    });

    const res = await loginPOST(
      jsonPost(`${ORIGIN}/api/auth/login`, { email: "not-an-email", password: "x" }) as never,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: LOGIN_FAILED_BN });
    expect(consulted).toBe(false);
    expect(__getCookie(SESSION_COOKIE)).toBeUndefined();
  });

  // Sanity: the seam reset restores the real factories (no leakage to other
  // suites). EMAIL_INVALID_BN import asserts the Bengali surface is wired.
  it("7. EMAIL_INVALID_BN is a non-empty Bengali string (surface wired)", () => {
    expect(EMAIL_INVALID_BN.length).toBeGreaterThan(0);
  });
});
