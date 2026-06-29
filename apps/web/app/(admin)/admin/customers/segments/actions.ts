"use server";

// Customer segment Server Actions — create / delete saved segments.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { createSegment, deleteSegment } from "@/lib/admin/segments";

export interface SegmentActionResult {
  ok: boolean;
  error?: string;
}

async function auth(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

const CreateInput = z.object({
  name: z.string().trim().min(1, "নাম দিন।").max(80),
  minOrders: z.coerce.number().int().min(0).max(100000),
  minSpent: z.coerce.number().min(0).max(1_000_000_000),
  tag: z.string().trim().max(60).optional().default(""),
});

export async function createSegmentAction(raw: unknown): Promise<SegmentActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };

  await createSegment(a.tenantId, a.userId, {
    name: parsed.data.name,
    minOrders: parsed.data.minOrders,
    minSpent: parsed.data.minSpent,
    tag: parsed.data.tag || null,
  });
  revalidatePath("/admin/customers/segments");
  return { ok: true };
}

export async function deleteSegmentAction(id: string): Promise<SegmentActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await deleteSegment(a.tenantId, a.userId, uid.data);
  revalidatePath("/admin/customers/segments");
  return { ok: true };
}
