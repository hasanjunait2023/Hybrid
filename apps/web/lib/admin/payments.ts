// Manual payment data layer (tenant roadmap P1 #4). Many BD sellers don't use a
// gateway — they accept a bKash/Nagad transfer, verify the TrxID by hand, and
// mark the order paid. Partial advance (a small bKash deposit + rest COD) is
// standard for premium goods and cuts RTO. All via withTenant (RLS).
//
// One source of truth: after recording a payment, the order's payment_status and
// remaining cod_amount are recomputed from the SUM of successful payments — so
// advance / full / multiple partials all stay consistent, and COD-due at the
// door always equals grand_total minus what's already paid.
import { withTenant } from "@hybrid/db";

export type ManualPaymentProvider = "bkash" | "nagad" | "manual";

export interface RecordManualPaymentInput {
  provider: ManualPaymentProvider;
  amount: number;
  transactionId?: string;
}

export interface ManualPaymentResult {
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  totalPaid: number;
  codDue: number;
}

export async function recordManualPayment(
  tenantId: string,
  userId: string,
  orderId: string,
  input: RecordManualPaymentInput,
): Promise<ManualPaymentResult> {
  if (!(input.amount > 0)) throw new Error("AMOUNT_REQUIRED");

  return withTenant(tenantId, userId, async (tx) => {
    const head = await tx<{ grand_total: string }[]>`
      select grand_total from orders where id = ${orderId} for update
    `;
    if (!head[0]) throw new Error("ORDER_NOT_FOUND");
    const grandTotal = Number(head[0].grand_total);

    await tx`
      insert into payment (tenant_id, order_id, provider, status, amount, transaction_id, paid_at)
      values (
        ${tenantId}, ${orderId}, ${input.provider}::payment_provider, 'success',
        ${input.amount}, ${input.transactionId ?? null}, now()
      )
    `;

    const paidRows = await tx<{ total: string }[]>`
      select coalesce(sum(amount), 0) as total
      from payment where order_id = ${orderId} and status = 'success'
    `;
    const totalPaid = Number(paidRows[0]?.total ?? 0);
    const paymentStatus =
      totalPaid >= grandTotal ? "paid" : totalPaid > 0 ? "partially_paid" : "unpaid";
    const codDue = Math.max(0, grandTotal - totalPaid);

    await tx`
      update orders
         set payment_status = ${paymentStatus}::order_payment_status,
             cod_amount = ${codDue},
             updated_at = now()
       where id = ${orderId}
    `;

    return { paymentStatus, totalPaid, codDue };
  });
}
