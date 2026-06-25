"use server";

// Plan management Server Actions (PP1-A4). Guarded by getPlatformAdmin.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { createPlan, updatePlan, setPlanActive, type PlanInput } from "@/lib/platform/plans";

export interface PlanActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const nullableInt = z.union([z.coerce.number().int().min(0).max(1_000_000), z.literal("").transform(() => null), z.null()]).nullable();

const Input = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, "code: lowercase/digits/hyphen"),
  name: z.string().trim().min(1).max(80),
  priceBdt: z.coerce.number().min(0).max(10_000_000),
  billingInterval: z.enum(["monthly", "yearly"]),
  maxProducts: nullableInt,
  maxOrdersMonth: nullableInt,
  maxCustomDomains: z.coerce.number().int().min(0).max(1000),
  maxStaff: z.coerce.number().int().min(1).max(1000),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

export async function savePlanAction(id: string | null, raw: unknown): Promise<PlanActionResult> {
  if (!(await getPlatformAdmin())) return { ok: false, error: "অনুমতি নেই।" };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ ইনপুট।" };
  const input = parsed.data as PlanInput;
  try {
    if (id) {
      const uid = z.string().uuid().safeParse(id);
      if (!uid.success) return { ok: false, error: "অবৈধ id।" };
      await updatePlan(uid.data, input);
      revalidatePath("/platform/plans");
      return { ok: true, id: uid.data };
    }
    const res = await createPlan(input);
    revalidatePath("/platform/plans");
    return { ok: true, id: res.id };
  } catch (e) {
    const msg = e instanceof Error && /duplicate|unique/i.test(e.message) ? "এই code আগে থেকে আছে।" : "সংরক্ষণ ব্যর্থ।";
    return { ok: false, error: msg };
  }
}

export async function togglePlanAction(id: string, active: boolean): Promise<PlanActionResult> {
  if (!(await getPlatformAdmin())) return { ok: false, error: "অনুমতি নেই।" };
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await setPlanActive(uid.data, active);
  revalidatePath("/platform/plans");
  return { ok: true };
}
