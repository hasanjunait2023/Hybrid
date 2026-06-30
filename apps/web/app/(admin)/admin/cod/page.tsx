import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { StatusBadge } from "@hybrid/ui";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCodPending } from "@/lib/admin/cod";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";

// COD-pending list (DESIGN §P7 honesty). Money owed to the seller: shipments
// whose COD hasn't been collected (cod_status='pending') with the expected total.
// Operator-facing → Latin numerals, mono amounts. We show the honest EXPECTED
// total — remittance reconciliation is Phase-2 (no Steadfast remittance API).
export default async function CodPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { rows, totalExpected, count } = await getCodPending(tenantId, session.userId);

  const { locale, d } = await getDict();
  const t = d.admin.cod.pending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <div className="text-right">
          <p className="text-xs text-ink-muted">
            {t.expectedCollection} ({formatNumber(count, locale)}
            {t.shipmentsUnit})
          </p>
          <p className="font-mono text-2xl font-bold text-st-pending tnum">
            {formatMoney(totalExpected, locale)}
          </p>
        </div>
      </div>

      <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-muted">
        {t.note}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-ink-muted">
          {t.empty}
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
                        {t.tracking}: {r.trackingCode}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-base font-bold text-st-pending tnum">
                      {formatMoney(r.codAmount, locale)}
                    </div>
                    <div className="mt-1">
                      <StatusBadge kind="fulfillment" value={r.shipmentStatus} lang={locale} />
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
