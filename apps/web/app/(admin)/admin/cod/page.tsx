import { redirect } from "next/navigation";
import { formatBdtLatin, StatusBadge } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCodPending } from "@/lib/admin/cod";

// COD-pending list (DESIGN §P7 honesty). Money owed to the seller: shipments
// whose COD hasn't been collected (cod_status='pending') with the expected total.
// Operator-facing → Latin numerals, mono amounts. We show the honest EXPECTED
// total — remittance reconciliation is Phase-2 (no Steadfast remittance API).
export default async function CodPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { rows, totalExpected, count } = await getCodPending(tenantId, session.userId);

  return (
    <div lang="en" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">COD বকেয়া</h1>
        <div className="text-right">
          <p className="text-xs text-ink-muted">প্রত্যাশিত সংগ্রহ ({count}টি চালান)</p>
          <p className="font-mono text-2xl font-bold text-st-pending tnum">
            {formatBdtLatin(totalExpected)}
          </p>
        </div>
      </div>

      <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-muted">
        ⓘ এটি কুরিয়ারের কাছে এখনো সংগ্রহ-বাকি টাকার প্রত্যাশিত হিসাব। কুরিয়ার রেমিট্যান্স মিলানো
        (reconciliation) পরের ধাপে আসবে।
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-ink-muted">
          কোনো COD বকেয়া নেই।
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.shipmentId}>
              <a
                href={`/admin/orders/${r.orderId}`}
                className="block rounded-lg border border-border bg-surface p-3 shadow-xs hover:bg-surface-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-ink">#{r.orderNumber}</span>
                    <span className="ml-2 text-sm text-ink-muted">{r.customerName ?? "—"}</span>
                    {r.trackingCode && (
                      <div className="mt-1 font-mono text-2xs text-ink-subtle">
                        ট্র্যাকিং: {r.trackingCode}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-base font-bold text-st-pending tnum">
                      {formatBdtLatin(r.codAmount)}
                    </div>
                    <div className="mt-1">
                      <StatusBadge kind="fulfillment" value={r.shipmentStatus} />
                    </div>
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
