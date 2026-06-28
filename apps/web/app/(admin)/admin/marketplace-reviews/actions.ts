"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { moderateReview } from "@/lib/marketplace/reviews";

export interface ModResult {
  ok: boolean;
  error?: string;
}

export async function moderateMarketplaceReview(
  reviewId: string,
  approve: boolean,
): Promise<ModResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  await moderateReview(tenantId, session.userId, reviewId, approve);
  revalidatePath("/admin/marketplace-reviews");
  return { ok: true };
}
