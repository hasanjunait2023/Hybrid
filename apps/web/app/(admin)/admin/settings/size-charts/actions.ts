"use server";

// =============================================================================
// R3 — Per-category size chart Server Actions.
//
// `saveSizeChart(tenantId, input)` — upserts a chart for (tenant,
// category). The merchant-facing editor is the only caller (the form
// already ran Zod validation client-side; we re-validate on the server as
// the security boundary).
//
// Same isolation contract as every other admin write: re-check session,
// resolve active tenant, then go through `withTenant(tenantId, userId,
// ...)` — never the raw `sql` client. Cache invalidation: bust
// `tenant:{id}` so the storefront PDP picks up the new chart on next
// render. The PDP's per-product cache (`tenant:{id}:product:{id}`) sits
// under `tenant:{id}` so it auto-invalidates too.
// =============================================================================

import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { upsertSizeChart } from "@/lib/products/sizeChart";
import type { SizeChartInput } from "@/lib/products/sizeChartSchema";

export interface SaveSizeChartResult {
  ok: boolean;
  error?: string;
}

export async function saveSizeChart(
  tenantId: string,
  input: SizeChartInput,
): Promise<SaveSizeChartResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };

  // Defence-in-depth: the caller (editor) passes the active tenantId from
  // getActiveTenantId(); we re-resolve here so an admin on tenant A cannot
  // write to tenant B by tampering with the request payload.
  const activeTenantId = await getActiveTenantId(session.userId);
  if (!activeTenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  if (activeTenantId !== tenantId) {
    return { ok: false, error: "অনুমতি নেই।" };
  }

  try {
    await upsertSizeChart(tenantId, session.userId, input);
  } catch (err) {
    // The Zod schema throws ZodError on bad data. Most likely causes:
    //   * category with disallowed characters (handled client-side too)
    //   * empty columns / empty rows
    // We log the raw error server-side and return a Bengali fallback.
    console.error("[saveSizeChart] failed", err);
    if (err instanceof Error && err.name === "ZodError") {
      return { ok: false, error: "ইনপুট ভুল।" };
    }
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  // Bust the storefront caches so the PDP and the size-chart modal refresh.
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:products`);
  return { ok: true };
}

// Note: no delete action. Removing charts isn't currently a seller
// requirement (merchants either re-edit or leave the chart published but
// hide the trigger from a category product-side). If we add a delete later
// we should soft-delete + audit log, mirroring the manual-refund O22
// pattern in apps/web/app/(admin)/admin/orders/actions.ts.
