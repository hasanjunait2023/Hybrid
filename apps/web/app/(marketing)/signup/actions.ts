"use server";

// Signup Server Action — the marketing → live-store handoff (blueprint W3
// S-MARKETING; phase1-blueprint "WAVE 3 … S-MARKETING(Bengali landing+signup)").
//
// Flow: validate → mint app_user (dev path) → provisionTenant (atomic platform
// txn) → sign the owner into the SAME dev-cookie seam dev-login uses → return
// the admin URL on the new tenant's host. provisionTenant is the published
// contract; we never write tenant rows directly (Golden Rule / no-raw-sql).
import { cookies } from "next/headers";
import {
  createAppUser,
  provisionTenant,
  SlugTakenError,
} from "@/lib/auth/provision";
import { DEV_SESSION_COOKIE, signDevCookie } from "@/lib/auth/session";
import { normalizeSlug, suggestSlugs, validateSlug, SLUG_ERROR_BN } from "./slug";

const STORE_NAME_MAX = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignupState {
  ok?: boolean;
  /** Inline field errors (Bengali), keyed by field name. */
  errors?: Partial<Record<"storeName" | "slug" | "email" | "form", string>>;
  /** Suggested alternative slugs when the chosen one is taken. */
  suggestions?: string[];
  /** Echo back the submitted values so the form repopulates on error. */
  values?: { storeName: string; slug: string; email: string };
  /** On success the client navigates here (admin on the new tenant host). */
  redirectTo?: string;
}

function rootDomain(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!root) throw new Error("NEXT_PUBLIC_ROOT_DOMAIN is not set");
  return root;
}

// The new store's admin lives on admin.{ROOT} (middleware routes that host to
// the admin app). Port is preserved in dev (lvh.me:3000). We resolve the port
// from the incoming request host header so the redirect works on :3000 locally
// and bare in prod.
function adminUrl(host: string): string {
  const root = rootDomain();
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${scheme}://admin.${root}${port}/admin`;
}

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const storeNameRaw = String(formData.get("storeName") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "");
  const emailRaw = String(formData.get("email") ?? "").trim();
  const slug = normalizeSlug(slugRaw);
  const values = { storeName: storeNameRaw, slug, email: emailRaw };

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

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values };
  }

  try {
    // (1) Mint the owner identity. Dev provider has no Supabase auth user, so we
    // create the app_user via the published createAppUser path (idempotent on
    // email — a retried signup reuses the same user). Under Supabase the trigger
    // would have created it and signup would skip straight to provisionTenant.
    const userId = await createAppUser({ email: emailRaw, fullName: storeNameRaw });

    // (2) Atomic platform provisioning: tenant(trial) + {slug}.{ROOT} domain +
    // owner membership + trialing subscription (+14d). Contract-owned. Throws
    // SlugTakenError on collision (caught below).
    await provisionTenant({ userId, storeName: storeNameRaw, slug });

    // (3) Sign the owner in via the SAME dev-cookie seam as /dev-login. The
    // cookie is set on the parent domain (.{ROOT}, no port) so it is readable on
    // admin.{ROOT} where the admin app runs — getSession() then resolves their
    // brand-new tenant from membership in the admin layout.
    const store = await cookies();
    store.set(DEV_SESSION_COOKIE, signDevCookie(userId), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      domain: `.${rootDomain()}`,
    });

    const host = (await getRequestHost()) ?? rootDomain();
    return { ok: true, redirectTo: adminUrl(host) };
  } catch (err: unknown) {
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
    return {
      ok: false,
      errors: { form: "দুঃখিত, কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।" },
      values,
    };
  }
}

// Read the incoming Host header so the redirect preserves the dev port.
async function getRequestHost(): Promise<string | null> {
  const { headers } = await import("next/headers");
  const h = await headers();
  return h.get("host");
}
