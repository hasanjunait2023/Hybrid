"use server";

// CRM task Server Actions — create / toggle done / delete (Phase R1.2).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { createTask, setTaskStatus, deleteTask } from "@/lib/admin/tasks";

export interface TaskActionResult {
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
  title: z.string().trim().min(1, "কাজের নাম দিন।").max(200),
  note: z.string().trim().max(2000).optional().default(""),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  // datetime-local string ("YYYY-MM-DDTHH:MM"), interpreted as Asia/Dhaka time.
  dueAt: z.string().trim().max(40).optional().default(""),
  customerId: z.string().uuid().optional().or(z.literal("")).default(""),
  orderId: z.string().uuid().optional().or(z.literal("")).default(""),
});

// Convert a tz-naive datetime-local value to an absolute ISO instant, reading it
// as Bangladesh local time (UTC+6) so "due 2pm" means 2pm in Dhaka.
function toDhakaIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local}:00+06:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createTaskAction(raw: unknown): Promise<TaskActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };

  await createTask(a.tenantId, a.userId, {
    title: parsed.data.title,
    note: parsed.data.note || null,
    priority: parsed.data.priority,
    dueAt: toDhakaIso(parsed.data.dueAt),
    customerId: parsed.data.customerId || null,
    orderId: parsed.data.orderId || null,
  });
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleTaskAction(id: string, done: boolean): Promise<TaskActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await setTaskStatus(a.tenantId, a.userId, uid.data, done ? "done" : "open");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteTaskAction(id: string): Promise<TaskActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  await deleteTask(a.tenantId, a.userId, uid.data);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return { ok: true };
}
