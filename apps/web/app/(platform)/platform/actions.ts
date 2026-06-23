"use server";

// Super-admin Server Actions (blueprint S-PLATFORM): suspend / reactivate a
// tenant, and impersonate a tenant owner.
//
// Authorization: EVERY action re-checks getPlatformAdmin() (never trusts the
// page-level gate alone — a Server Action is a public endpoint). Tenant ids are
// validated as UUIDs at the boundary. Errors are friendly Bengali, no leaks.
import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { setTenantStatus, getTenantOwnerUserId } from "@/lib/platform/data";
import { bustTenantDomainCache } from "@/lib/platform/cache";
import { DEV_SESSION_COOKIE, signDevCookie } from "@/lib/auth/session";

const TenantId = z.string().uuid();

export interface PlatformActionResult {
  ok: boolean;
  error?: string;
}

// Suspend (status -> suspended) or reactivate (-> active). Busts the
// host->tenant cache so the storefront enforcement (resolve.ts) takes effect on
// the next request. resolve.ts treats active/trial/past_due as live and only
// 404s suspended/cancelled, so suspension is FREE once the status flips and the
// cache is evicted.
async function flipStatus(
  tenantId: string,
  status: "active" | "suspended",
): Promise<PlatformActionResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "অনুমতি নেই।" };

  const parsed = TenantId.safeParse(tenantId);
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };

  const affected = await setTenantStatus(parsed.data, status);
  if (affected === 0) return { ok: false, error: "স্টোর পাওয়া যায়নি।" };

  await bustTenantDomainCache(parsed.data);
  revalidatePath("/platform");
  return { ok: true };
}

export async function suspendTenant(tenantId: string): Promise<PlatformActionResult> {
  return flipStatus(tenantId, "suspended");
}

export async function reactivateTenant(tenantId: string): Promise<PlatformActionResult> {
  return flipStatus(tenantId, "active");
}

// Impersonate a tenant owner — reuses the EXISTING dev-login seam (the signed
// hybrid_dev_session cookie) rather than inventing a new auth path. A super-admin
// gets the owner's session, so admin.{root} then renders that tenant's admin.
//
// Gated to non-prod exactly like /dev-login (the dev cookie is only trusted when
// NODE_ENV !== 'production'; getSession refuses it in prod). True cross-user
// impersonation under the Supabase provider is a later seam — flagged.
export async function impersonateTenantOwner(
  tenantId: string,
): Promise<PlatformActionResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: "অনুমতি নেই।" };

  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "প্রোডাকশনে ইমপারসোনেশন বন্ধ।" };
  }

  const parsed = TenantId.safeParse(tenantId);
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };

  const ownerId = await getTenantOwnerUserId(parsed.data);
  if (!ownerId) return { ok: false, error: "স্টোরের মালিক পাওয়া যায়নি।" };

  // signDevCookie throws if DEV_SESSION_SECRET is unset (fail-fast) — same guard
  // as /dev-login. The cookie shape is identical, so getSession() accepts it.
  //
  // CROSS-SUBDOMAIN: this action runs on app.{root}, but the impersonated admin
  // is served on admin.{root}. A host-only cookie wouldn't carry across, so we
  // scope it to the parent domain (.{root}) — dev-only and gated, so widening the
  // cookie scope here is safe. Falls back to host-only if the root isn't set.
  const value = signDevCookie(ownerId);
  const store = await cookies();
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  store.set(DEV_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    ...(root ? { domain: `.${root}` } : {}),
  });

  return { ok: true };
}
