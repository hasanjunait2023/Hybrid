import { formatMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

// Order edit history (O3). Server-rendered. Shows every order_edits row
// for this order, newest first. Used inside the order detail page below
// the items table, alongside the existing RefundHistory.

export interface OrderEditRow {
  id: string;
  edit_seq: number;
  before: Record<string, { quantity: number; unit_price: number; line_total: number }>;
  after: Record<string, { quantity: number; unit_price: number; line_total: number }>;
  reason: string;
  actor_email: string | null;
  occurred_at: string;
}

export interface EditHistoryProps {
  edits: OrderEditRow[];
  locale: Locale;
  labels: {
    title: string;
    empty: string;
    seq: string;
    reason: string;
    by: string;
    at: string;
    changes: string;
    before: string;
    after: string;
    quantity: string;
    price: string;
    lineTotal: string;
  };
}

export function EditHistory({ edits, locale, labels }: EditHistoryProps) {
  if (edits.length === 0) {
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
        {edits.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono font-semibold text-ink">
                {labels.seq} #{e.edit_seq}
              </span>
              <span className="text-xs text-ink-muted">
                {new Date(e.occurred_at).toLocaleString(locale)}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              <span className="font-semibold text-ink">{labels.reason}:</span> {e.reason}
            </p>
            {e.actor_email && (
              <p className="text-xs text-ink-muted">
                <span className="font-semibold text-ink">{labels.by}:</span> {e.actor_email}
              </p>
            )}
            <div className="mt-1 space-y-2">
              <p className="text-xs font-semibold text-ink">{labels.changes}</p>
              <table className="w-full text-xs">
                <thead className="text-ink-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{labels.quantity}</th>
                    <th className="px-2 py-1 text-right">{labels.price}</th>
                    <th className="px-2 py-1 text-right">{labels.lineTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(e.after).map(([itemId, afterVal]) => {
                    const beforeVal = e.before[itemId];
                    return (
                      <tr key={itemId}>
                        <td className="px-2 py-1 font-mono tnum">
                          <span className="text-ink-muted">{beforeVal?.quantity ?? "—"}</span>{" "}
                          → <span className="font-semibold text-ink">{afterVal.quantity}</span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono tnum">
                          <span className="text-ink-muted">
                            {formatMoney(Number(beforeVal?.unit_price ?? 0), locale)}
                          </span>{" "}
                          →{" "}
                          <span className="font-semibold text-ink">
                            {formatMoney(Number(afterVal.unit_price), locale)}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono tnum">
                          <span className="text-ink-muted">
                            {formatMoney(Number(beforeVal?.line_total ?? 0), locale)}
                          </span>{" "}
                          →{" "}
                          <span className="font-semibold text-ink">
                            {formatMoney(Number(afterVal.line_total), locale)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Server-side helper: fetch edit history for the order detail page. Joins
// order_edits with app_user for the actor email. RLS keeps it tenant-scoped.
export async function fetchEditHistory(
  tenantId: string,
  userId: string | null,
  orderId: string,
): Promise<OrderEditRow[]> {
  const { withTenant } = await import("@hybrid/db");
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        edit_seq: number;
        before: Record<string, { quantity: number; unit_price: number; line_total: number }>;
        after: Record<string, { quantity: number; unit_price: number; line_total: number }>;
        reason: string;
        actor_email: string | null;
        occurred_at: string;
      }[]
    >`
      select oe.id, oe.edit_seq, oe.before, oe.after, oe.reason,
             u.email as actor_email,
             oe.occurred_at
        from order_edits oe
        left join app_user u on u.id = oe.actor_user_id
       where oe.order_id = ${orderId}
       order by oe.edit_seq desc
    `,
  );
  return rows;
}
