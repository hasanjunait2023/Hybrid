"use server";

// Manual payment Server Action (P1 #4). Seller verifies a bKash/Nagad TrxID (or
// takes cash) and marks the order paid — full or partial advance. Auth + RLS via
// the recordManualPayment core; revalidates order/cod/dashboard so the COD-due
// and payment chips update everywhere.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { recordManualPayment } from "@/lib/admin/payments";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface MarkPaymentResult {
  ok: boolean;
  error?: string;
  paymentStatus?: "unpaid" | "partially_paid" | "paid";
  codDue?: number;
}

const Input = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(["bkash", "nagad", "manual"]),
  amount: z.coerce.number().positive("পরিমাণ দিন").max(10_000_000),
  transactionId: z.string().trim().max(64).optional(),
});

export async function markManualPayment(
  orderId: string,
  provider: string,
  amount: number,
  transactionId?: string,
): Promise<MarkPaymentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const parsed = Input.safeParse({ orderId, provider, amount, transactionId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ অনুরোধ।" };
  }

  try {
    const res = await recordManualPayment(tenantId, session.userId, parsed.data.orderId, {
      provider: parsed.data.provider,
      amount: parsed.data.amount,
      transactionId: parsed.data.transactionId,
    });
    revalidateTag(`tenant:${tenantId}:orders`);
    revalidateTag(`tenant:${tenantId}:order:${parsed.data.orderId}`);
    revalidateTag(`tenant:${tenantId}:cod`);
    revalidateTag(`tenant:${tenantId}:dashboard`);
    return { ok: true, paymentStatus: res.paymentStatus, codDue: res.codDue };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_NOT_FOUND") return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
    if (msg === "AMOUNT_REQUIRED") return { ok: false, error: "পরিমাণ দিন।" };
    return { ok: false, error: "পেমেন্ট রেকর্ড ব্যর্থ হয়েছে।" };
  }
}
