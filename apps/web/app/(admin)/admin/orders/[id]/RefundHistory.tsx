import { formatMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

// Refund history list (O22). Server-rendered. Shows all manual_refund rows for
// the order, newest first. Used inside the order detail page below the items.

export interface RefundHistoryProps {
  refunds: RefundRow[];
  locale: Locale;
  labels: {
    title: string;
    empty: string;
    method: string;
    amount: string;
    reference: string;
    initiatedBy: string;
    note: string;
    refundedAt: string;
  };
}

export interface RefundRow {
  id: string;
  refund_amount: string;
  refund_method: "bkash" | "nagad" | "cash" | "none";
  payout_reference: string | null;
  note: string | null;
  refunded_at: string | null;
  initiated_by_email: string | null;
}

const methodLabelBn: Record<RefundRow["refund_method"], string> = {
  bkash: "বিকাশ",
  nagad: "নগদ",
  cash: "ক্যাশ",
  none: "—",
};

export function RefundHistory({ refunds, locale, labels }: RefundHistoryProps) {
  if (refunds.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">{labels.title}</h3>
        <p className="mt-2 text-sm text-ink-muted">{labels.empty}</p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{labels.title}</h3>
      <ul className="mt-3 space-y-3">
        {refunds.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-3 text-sm"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono font-semibold tnum text-ink">
                {formatMoney(Number(r.refund_amount), locale)}
              </span>
              <span className="text-xs text-ink-muted">
                {r.refunded_at
                  ? new Date(r.refunded_at).toLocaleString(locale)
                  : "—"}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span>
                {labels.method}:{" "}
                <span className="font-semibold text-ink">
                  {methodLabelBn[r.refund_method]}
                </span>
              </span>
              {r.payout_reference && (
                <span>
                  {labels.reference}:{" "}
                  <span className="font-mono text-ink">{r.payout_reference}</span>
                </span>
              )}
              {r.initiated_by_email && (
                <span>
                  {labels.initiatedBy}: {r.initiated_by_email}
                </span>
              )}
            </div>
            {r.note && (
              <p className="mt-1 whitespace-pre-line text-xs text-ink-muted">
                {labels.note}: {r.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Server-side helper: fetch refund rows for the order detail page.
// Reads return_request joined with auth.users for the initiator email.
export async function fetchRefundHistory(
  tenantId: string,
  userId: string | null,
  orderId: string,
): Promise<RefundRow[]> {
  const { withTenant } = await import("@hybrid/db");
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<RefundRow[]>`
      select r.id, r.refund_amount, r.refund_method, r.payout_reference,
             r.note, r.refunded_at,
             u.email as initiated_by_email
        from return_request r
        left join auth.users u on u.id = r.initiated_by
       where r.order_id = ${orderId} and r.type = 'manual_refund'
       order by r.created_at desc
    `,
  );
  return rows;
}