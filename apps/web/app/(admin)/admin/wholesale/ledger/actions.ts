"use server";

// Customer Ledger Server Actions.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listLedgerEntries } from "@/lib/admin/wholesale";
import type { LedgerEntry } from "@/lib/admin/wholesale";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function bustTags(tenantId: string, customerId?: string): void {
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:wholesale:ledger`);
  if (customerId) {
    revalidateTag(`tenant:${tenantId}:wholesale:customer:${customerId}`);
  }
}

export async function getCustomerLedger(
  customerId: string,
): Promise<LedgerEntry[]> {
  const auth = await authTenant();
  if (!auth.ok) return [];
  return listLedgerEntries(auth.tenantId, auth.userId, customerId);
}

const RecordPaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().min(1, "পরিমাণ ১ এর বেশি হতে হবে"),
  referenceType: z.string().trim().max(100).optional().default(""),
  referenceId: z.string().trim().max(100).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
});

export async function recordPayment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = RecordPaymentSchema.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount") || 0,
    referenceType: formData.get("referenceType") ?? "",
    referenceId: formData.get("referenceId") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      // Get current balance
      const lastEntry = await tx<{ balance: string }[]>`
        select balance from customer_ledger
        where customer_id = ${input.customerId}
          and tenant_id = ${auth.tenantId}
        order by created_at desc
        limit 1
      `;
      const currentBalance = lastEntry[0] ? Number(lastEntry[0].balance) : 0;
      const newBalance = currentBalance - input.amount; // payment reduces due

      // Insert ledger entry
      await tx`
        insert into customer_ledger (tenant_id, customer_id, type, amount, balance,
                                      reference_type, reference_id, note)
        values (${auth.tenantId}, ${input.customerId}, 'payment',
                ${input.amount}, ${newBalance},
                ${input.referenceType || null}, ${input.referenceId || null},
                ${input.note || null})
      `;

      // Update customer current_due
      await tx`
        update customer
           set current_due = current_due - ${input.amount},
               updated_at = now()
         where id = ${input.customerId}
           and tenant_id = ${auth.tenantId}
      `;
    });
  } catch (error) {
    console.error("[recordPayment] failed", error);
    return { ok: false, error: "পেমেন্ট রেকর্ড করতে ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId, input.customerId);
  return { ok: true };
}

const IssueCreditNoteSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().min(1, "পরিমাণ ১ এর বেশি হতে হবে"),
  note: z.string().trim().max(500).optional().default(""),
});

export async function issueCreditNote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = IssueCreditNoteSchema.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount") || 0,
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      // Get current balance
      const lastEntry = await tx<{ balance: string }[]>`
        select balance from customer_ledger
        where customer_id = ${input.customerId}
          and tenant_id = ${auth.tenantId}
        order by created_at desc
        limit 1
      `;
      const currentBalance = lastEntry[0] ? Number(lastEntry[0].balance) : 0;
      const newBalance = currentBalance - input.amount; // credit note reduces due

      // Insert ledger entry
      await tx`
        insert into customer_ledger (tenant_id, customer_id, type, amount, balance, note)
        values (${auth.tenantId}, ${input.customerId}, 'credit_note',
                ${input.amount}, ${newBalance}, ${input.note || null})
      `;

      // Update customer current_due
      await tx`
        update customer
           set current_due = current_due - ${input.amount},
               updated_at = now()
         where id = ${input.customerId}
           and tenant_id = ${auth.tenantId}
      `;
    });
  } catch (error) {
    console.error("[issueCreditNote] failed", error);
    return { ok: false, error: "ক্রেডিট নোট ইস্যু করতে ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId, input.customerId);
  return { ok: true };
}
