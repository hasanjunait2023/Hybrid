"use server";

// Customers Server Actions (blueprint S-CUSTOMERS 1.4). Update note + tags.
// Authenticates + authorizes inside; revalidates tenant:{id}:customers.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface ActionResult {
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

const UpdateInput = z.object({
  customerId: z.string().uuid(),
  note: z.string().trim().max(2000).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export async function updateCustomerNoteAndTags(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const tagsRaw = formData.get("tags");
  const tags =
    typeof tagsRaw === "string" && tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

  const parsed = UpdateInput.safeParse({
    customerId: formData.get("customerId"),
    note: formData.get("note") ?? "",
    tags,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  await withTenant(auth.tenantId, auth.userId, async (tx) => {
    await tx`
      update customer
         set note = ${input.note}, tags = ${input.tags}, updated_at = now()
       where id = ${input.customerId}
    `;
  });

  revalidateTag(`tenant:${auth.tenantId}:customers`);
  return { ok: true };
}
