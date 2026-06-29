"use server";

// Growth-coach AI Server Action (Phase R2.3). Builds the grounding context from
// the live health score, then calls the env-gated AI seam. Degrades cleanly to
// { configured:false } when no provider key is set — the page then shows the
// deterministic recommendations only.
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getBusinessHealth } from "@/lib/admin/healthScore";
import { askGrowthCoach, type CoachReply } from "@/lib/ai/coach";

export async function askCoachAction(question: string): Promise<CoachReply> {
  const session = await getSession();
  if (!session) return { configured: false, error: "auth" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { configured: false, error: "auth" };

  const parsed = z.string().trim().min(1).max(1000).safeParse(question);
  if (!parsed.success) return { configured: true, error: "empty" };

  const health = await getBusinessHealth(tenantId, session.userId);
  return askGrowthCoach(parsed.data, {
    score: health.score,
    grade: health.grade,
    factors: health.factors.map((f) => `${f.key}:${f.score}`).join(", "),
    highlights: health.recommendations.map((r) => r.key + (r.value !== undefined ? `=${r.value}` : "")),
  });
}
