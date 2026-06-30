"use server";

// =============================================================================
// O13 — saveTenantTax server action.
//
// Persists TIN and BIN on the `tenant` row, both via withTenant() (RLS forced).
// The Zod schema in lib/settings/tenantTax.ts mirrors the DB CHECK constraints
// in 32_o13_tin_bin.sql — either layer catches bad input.
//
// Empty / whitespace input clears the column (the merchant can wipe a typo).
// The store profile settings tag is revalidated so the admin order detail
// invoice preview and the print invoice both pick up the new value.
// =============================================================================

import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { saveTenantTaxIds, TenantTaxInput } from "@/lib/settings/tenantTax";

export interface TaxSettingsResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

export async function saveTenantTax(
  _prev: TaxSettingsResult | null,
  formData: FormData,
): Promise<TaxSettingsResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = TenantTaxInput.safeParse({
    tin: formData.get("tin") ?? "",
    bin: formData.get("bin") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।",
    };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      // Save via the helper so the dynamic SET list lives in one place.
      // Re-import here to keep the server-side module surface tight.
      await saveTenantTaxIds(auth.tenantId, auth.userId, {
        tin: input.tin.trim() === "" ? null : input.tin.trim(),
        bin: input.bin.trim() === "" ? null : input.bin.trim(),
      });
      // touch tx to silence the unused-var lint while keeping the txn open
      // (the helper commits internally).
      void tx;
    });
  } catch (err) {
    console.error("[saveTenantTax] failed", err);
    // DB CHECK violation message includes the constraint name; surface a
    // friendly Bengali fallback regardless of the exact DB text.
    const msg = err instanceof Error ? err.message : String(err);
    if (/tenant_tin_format/.test(msg)) {
      return { ok: false, error: "TIN অবশ্যই ১২ সংখ্যার হতে হবে।" };
    }
    if (/tenant_bin_format/.test(msg)) {
      return { ok: false, error: "BIN অবশ্যই ১০ সংখ্যার হতে হবে।" };
    }
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  // Bust the tenant-level cache so the print invoice and admin order detail
  // pick up the new IDs immediately.
  revalidateTag(`tenant:${auth.tenantId}`);
  revalidateTag(`tenant:${auth.tenantId}:settings`);
  return { ok: true };
}