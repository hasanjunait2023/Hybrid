"use server";

// CRM lead Server Actions — create / move stage / convert / delete (Phase R1.3).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  createLead,
  setLeadStage,
  convertLead,
  deleteLead,
  type LeadStage,
} from "@/lib/admin/leads";

export interface LeadActionResult {
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

const STAGES = ["new", "contacted", "qualified", "won", "lost"] as const;

const CreateInput = z.object({
  name: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(20).optional().default(""),
  source: z
    .enum(["manual", "abandoned_cart", "inquiry", "facebook", "whatsapp"])
    .optional()
    .default("manual"),
  estValue: z.coerce.number().min(0).max(1_000_000_000).optional().default(0),
  note: z.string().trim().max(2000).optional().default(""),
});

export async function createLeadAction(raw: unknown): Promise<LeadActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  if (!parsed.data.name && !parsed.data.phone) {
    return { ok: false, error: "নাম বা ফোন দিন।" };
  }

  await createLead(a.tenantId, a.userId, {
    name: parsed.data.name || null,
    phone: parsed.data.phone || null,
    source: parsed.data.source,
    estValue: parsed.data.estValue,
    note: parsed.data.note || null,
  });
  revalidatePath("/admin/leads");
  return { ok: true };
}

export async function setLeadStageAction(id: string, stage: string): Promise<LeadActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  const st = z.enum(STAGES).safeParse(stage);
  if (!uid.success || !st.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await setLeadStage(a.tenantId, a.userId, uid.data, st.data as LeadStage);
  revalidatePath("/admin/leads");
  return { ok: true };
}

export async function convertLeadAction(id: string): Promise<LeadActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  const res = await convertLead(a.tenantId, a.userId, uid.data);
  if (!res.ok) {
    return { ok: false, error: res.reason === "no_phone" ? "রূপান্তর করতে ফোন নম্বর দরকার।" : "লিড পাওয়া যায়নি।" };
  }
  revalidatePath("/admin/leads");
  revalidatePath("/admin/customers");
  return { ok: true };
}

export async function deleteLeadAction(id: string): Promise<LeadActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await deleteLead(a.tenantId, a.userId, uid.data);
  revalidatePath("/admin/leads");
  return { ok: true };
}
