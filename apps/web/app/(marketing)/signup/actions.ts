"use server";

// Signup Server Action — the marketing → live-store handoff (blueprint W3
// S-MARKETING; phase1-blueprint "WAVE 3 … S-MARKETING(Bengali landing+signup)").
//
// Flow: validate → mint app_user (with an Argon2id password hash) → in prod
// (AUTH_PROVIDER=supabase) also create the GoTrue credential user → provisionTenant
// (atomic platform txn) → mint the app session, provider-aware EXACTLY like
// getSession() dispatches: supabase/password → the real opaque hybrid_session;
// dev → the HMAC dev cookie → return the admin URL on the new tenant's host.
// provisionTenant is the published contract; we never write tenant rows directly
// (Golden Rule / no-raw-sql). Email + password signup; no phone OTP (SMS gated).
// Never throws to the client — every failure returns a friendly Bengali SignupState.
import { cookies } from "next/headers";
import {
  createAppUser,
  provisionTenant,
  deleteOwnerlessUser,
  SlugTakenError,
} from "@/lib/auth/provision";
import { hashPassword } from "@/lib/auth/password";
import { supabaseAdminClient } from "@/lib/auth/supabaseAuth";
import { DEV_SESSION_COOKIE, signDevCookie, createSession } from "@/lib/auth/session";
import { passwordSchema, PASSWORD_TOO_WEAK_BN, GENERIC_ERROR_BN } from "@/lib/auth/validate";
import { rateLimit, clientIpFrom } from "@/lib/ratelimit";
import { firePlatformLead } from "@/lib/analytics/platform";
import { normalizeSlug, suggestSlugs, validateSlug, SLUG_ERROR_BN } from "./slug";

const STORE_NAME_MAX = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Shown for both an existing app_user and an existing GoTrue credential — never
// reveal which store of identity matched (no account-enumeration oracle).
const EMAIL_TAKEN_BN = "এই ইমেইল ইতিমধ্যে ব্যবহৃত — লগ ইন করুন।";

// Abuse dampener: a single IP may attempt at most SIGNUP_MAX_PER_WINDOW signups
// per SIGNUP_WINDOW_SECONDS. Fails open if Redis is down (see lib/ratelimit.ts).
const SIGNUP_MAX_PER_WINDOW = 5;
const SIGNUP_WINDOW_SECONDS = 60 * 60; // 1 hour

export interface SignupState {
  ok?: boolean;
  /** Inline field errors (Bengali), keyed by field name. */
  errors?: Partial<Record<"storeName" | "slug" | "email" | "password" | "form", string>>;
  /** Suggested alternative slugs when the chosen one is taken. */
  suggestions?: string[];
  /** Echo back the submitted values so the form repopulates on error. */
  values?: { storeName: string; slug: string; email: string; businessType: "retail" | "wholesale" };
  /** On success the client navigates here (admin on the new tenant host). */
  redirectTo?: string;
}

function rootDomain(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!root) throw new Error("NEXT_PUBLIC_ROOT_DOMAIN is not set");
  return root;
}

// The new store's admin lives at the ROOT of admin.{ROOT}. The host->path
// rewrite in middleware.ts maps the `admin` subdomain onto the /admin route
// segment (admin.{ROOT}/products -> /admin/products), so the redirect target
// must be the bare host root ("/"), NOT "/admin" — "/admin" would rewrite to
// "/admin/admin" and 404. Mirrors the post-login redirect (LoginForm -> "/").
// Port is preserved in dev (lvh.me:3000); resolved from the incoming host header.
function adminUrl(host: string): string {
  const root = rootDomain();
  const isProd = process.env.NODE_ENV === "production";
  const scheme = isProd ? "https" : "http";
  // Authority host is the trusted ROOT, not the Host header. Never derive a port
  // in prod (bare 443); in dev accept ONLY a numeric suffix so a crafted Host
  // ("admin.x:443@evil.com") can't inject userinfo/@ and open-redirect the
  // post-signup navigation.
  const m = isProd ? null : host.match(/:(\d{1,5})$/);
  const port = m ? `:${m[1]}` : "";
  return `${scheme}://admin.${root}${port}/`;
}

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const storeNameRaw = String(formData.get("storeName") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "");
  const emailRaw = String(formData.get("email") ?? "").trim();
  const passwordRaw = String(formData.get("password") ?? "");
  const slug = normalizeSlug(slugRaw);
  // Store type — seller self-selects at signup. Only retail|wholesale are offered
  // ('both' is deferred); anything else falls back to retail. A wholesaler signup
  // provisions as 'wholesale' (KYC-pending until a platform admin approves).
  const businessType: "retail" | "wholesale" =
    String(formData.get("businessType") ?? "retail") === "wholesale" ? "wholesale" : "retail";
  // Echo back everything EXCEPT the password (never round-trip a secret).
  const values = { storeName: storeNameRaw, slug, email: emailRaw, businessType };

  // --- Server-side validation (never trust the client gate) ---
  const errors: NonNullable<SignupState["errors"]> = {};
  if (storeNameRaw.length === 0) {
    errors.storeName = "দোকানের নাম লিখুন।";
  } else if (storeNameRaw.length > STORE_NAME_MAX) {
    errors.storeName = "দোকানের নাম ৬০ অক্ষরের বেশি হতে পারবে না।";
  }

  const slugError = validateSlug(slug);
  if (slugError) errors.slug = SLUG_ERROR_BN[slugError];

  if (emailRaw.length === 0) {
    errors.email = "ইমেইল ঠিকানা লিখুন।";
  } else if (!EMAIL_RE.test(emailRaw)) {
    errors.email = "সঠিক ইমেইল ঠিকানা লিখুন।";
  }

  if (passwordRaw.length === 0) {
    errors.password = "পাসওয়ার্ড দিন।";
  } else if (!passwordSchema.safeParse(passwordRaw).success) {
    errors.password = PASSWORD_TOO_WEAK_BN;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values };
  }

  // Per-IP abuse dampener before any DB write. Auth bucket: fails CLOSED on a Redis outage.
  const ip = clientIpFrom(await requestHeaders());
  const rl = await rateLimit({
    bucket: "signup",
    identifier: ip,
    limit: SIGNUP_MAX_PER_WINDOW,
    windowSeconds: SIGNUP_WINDOW_SECONDS,
    failClosed: true,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      errors: { form: "অনেকবার চেষ্টা করা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।" },
      values,
    };
  }

  // (1) Mint the owner identity with an Argon2id password hash. createAppUser is
  // idempotent on email and reports created-vs-matched: a pre-existing email
  // means someone already owns this account, so we REFUSE rather than hand the
  // caller a session for it (account-takeover guard).
  let userId: string;
  // GoTrue auth.users id when AUTH_PROVIDER=supabase. Hoisted to function scope so
  // the provisioning-failure rollback below can also drop the GoTrue credential —
  // otherwise a failed provision (e.g. a slug collision on the first attempt)
  // leaves an orphan auth.users row and the email is permanently refused as
  // "already used" on every retry, with no app_user/tenant to log into.
  let supaUserId: string | null = null;
  try {
    const passwordHash = await hashPassword(passwordRaw);
    const created = await createAppUser({
      email: emailRaw,
      fullName: storeNameRaw,
      passwordHash,
    });
    if (!created.created) {
      return { ok: false, errors: { email: EMAIL_TAKEN_BN }, values };
    }
    userId = created.userId;

    // (2) AUTH_PROVIDER=supabase: GoTrue is the credential authority, so the new
    // seller must also exist in auth.users. email_confirm=true lets them sign in
    // immediately. On failure, roll back the orphan app_user so a retry isn't
    // refused as "already used".
    if (process.env.AUTH_PROVIDER === "supabase") {
      const { data: supaData, error: supaErr } =
        await supabaseAdminClient().auth.admin.createUser({
          email: emailRaw,
          password: passwordRaw,
          email_confirm: true,
        });
      if (supaErr) {
        await deleteOwnerlessUser(userId).catch((cleanupErr) =>
          console.error("[signup] orphan user cleanup failed", cleanupErr),
        );
        const dup = /registered|already|exists/i.test(supaErr.message);
        return dup
          ? { ok: false, errors: { email: EMAIL_TAKEN_BN }, values }
          : { ok: false, errors: { form: GENERIC_ERROR_BN }, values };
      }
      supaUserId = supaData.user?.id ?? null;
    }
  } catch (err: unknown) {
    console.error("[signup] user creation failed", err);
    return { ok: false, errors: { form: GENERIC_ERROR_BN }, values };
  }

  try {
    // (3) Atomic platform provisioning: tenant(trial) + {slug}.{ROOT} domain +
    // owner membership + trialing subscription (+14d). Contract-owned. Throws
    // SlugTakenError on collision (caught below).
    await provisionTenant({ userId, storeName: storeNameRaw, slug, businessType });

    // (4) Mint the app session, provider-aware EXACTLY like getSession() dispatches.
    // supabase/password → the real opaque hybrid_session (DB-backed, the cookie
    // getSession() reads in production); dev (local) → the HMAC dev cookie, the
    // /dev-login seam getDevSession() reads. The cookie is scoped to the parent
    // domain so it is readable on admin.{ROOT} where the admin app runs.
    const provider = process.env.AUTH_PROVIDER;
    if (provider === "supabase" || provider === "password") {
      await createSession(userId, {
        ip,
        userAgent: (await requestHeaders()).get("user-agent"),
      });
    } else {
      const store = await cookies();
      store.set(DEV_SESSION_COOKIE, signDevCookie(userId), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        domain: `.${rootDomain()}`,
      });
    }

    const host = (await getRequestHost()) ?? rootDomain();

    // TRACK-V2-A1 §10: fire the platform-owned CompleteRegistration event to
    // GA4 + Meta + TikTok. Best-effort — wrapped in try/catch so a tracking
    // outage can never break a successful signup. The marketing landing's
    // page_view (PlatformTracker) and the form-fill Lead (Phase A.10) give
    // the platform admin a full funnel from impression → trial.
    try {
      await firePlatformLead({
        email: emailRaw,
        businessType,
        eventName: "complete_registration",
      });
    } catch (trackErr) {
      console.error("[signup] platform tracking failed (non-blocking):", trackErr);
    }

    return { ok: true, redirectTo: adminUrl(host) };
  } catch (err: unknown) {
    // Provisioning failed → the app_user we just minted owns no tenant. Drop the
    // orphan so a legitimate retry with this email isn't refused as "already
    // used" (the created-vs-matched takeover guard above).
    await deleteOwnerlessUser(userId).catch((cleanupErr) =>
      console.error("[signup] orphan user cleanup failed", cleanupErr),
    );
    // …and the matching GoTrue credential, if we created one. Without this a
    // slug collision (the common first-attempt retry) leaves the email locked:
    // app_user is gone but auth.users survives, so the retry's GoTrue createUser
    // returns "already registered" and the seller can never complete signup.
    if (supaUserId) {
      await supabaseAdminClient()
        .auth.admin.deleteUser(supaUserId)
        .catch((cleanupErr) =>
          console.error("[signup] orphan GoTrue cleanup failed", cleanupErr),
        );
    }

    if (err instanceof SlugTakenError) {
      return {
        ok: false,
        errors: { slug: err.message },
        suggestions: suggestSlugs(slug),
        values,
      };
    }
    // Unexpected failure — friendly Bengali, no internal leakage. Logged server-side.
    console.error("[signup] provisioning failed", err);
    return { ok: false, errors: { form: GENERIC_ERROR_BN }, values };
  }
}

// Read the incoming Host header so the redirect preserves the dev port.
async function getRequestHost(): Promise<string | null> {
  const h = await requestHeaders();
  return h.get("host");
}

// The incoming request headers (for client-IP extraction in the rate limiter).
async function requestHeaders(): Promise<Headers> {
  const { headers } = await import("next/headers");
  return headers();
}
