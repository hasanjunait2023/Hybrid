import { redirect } from "next/navigation";
import { StatusBadge, DeltaAmount, DiscrepancyStat, EmptyState } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getSettlements } from "@/lib/admin/cod";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { RemittanceUpload } from "./RemittanceUpload";
import { ResolveButton } from "./ResolveButton";

// COD & Settlements view (DESIGN §Q3 — THE differentiator). Operator-facing →
// Latin numerals + mono tnum. Discrepancies are made VISUALLY UNMISSABLE: danger
// row tint + left edge bar + গরমিল chip; matched rows stay calm. Every amount is
// REAL — written only by the reconciliation engine from a courier CSV.
export default async function SettlementsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { summary, rows, batches } = await getSettlements(tenantId, session.userId);

  const { locale, d } = await getDict();
  const t = d.admin.cod.settlements;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <RemittanceUpload />
      </div>

      {/* Q3.1 Summary band — the morning glance. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium text-ink-muted">{t.summary.expected}</p>
          <p className="mt-1 font-mono text-2xl font-bold tnum text-ink">{formatMoney(summary.expected, locale)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium text-ink-muted">{t.summary.collected}</p>
          <p className="mt-1 font-mono text-2xl font-bold tnum text-cod">{formatMoney(summary.collected, locale)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium text-ink-muted">{t.summary.remitted}</p>
          <p className="mt-1 font-mono text-2xl font-bold tnum text-cod">{formatMoney(summary.remitted, locale)}</p>
        </div>
        <DiscrepancyStat
          label={t.summary.discrepancyLabel}
          amount={summary.discrepancy}
          discrepancyCount={summary.discrepancyCount}
          lang={locale}
        />
      </div>

      {/* Q3.2 Per-shipment match table — the evidence. */}
      {rows.length === 0 ? (
        <EmptyState
          title={t.emptyRows.title}
          hint={t.emptyRows.hint}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-2xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{t.table.shipmentOrder}</th>
                <th className="px-3 py-2 text-right font-semibold">{t.table.expected}</th>
                <th className="px-3 py-2 text-right font-semibold">{t.table.collected}</th>
                <th className="px-3 py-2 text-right font-semibold">{t.table.remitted}</th>
                <th className="px-3 py-2 text-right font-semibold">{t.table.discrepancy}</th>
                <th className="px-3 py-2 text-left font-semibold">{t.table.status}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isDiscrepancy = r.codStatus === "discrepancy";
                // "No remittance for a delivered shipment" — the most serious case.
                const missing = isDiscrepancy && r.remitted == null;
                return (
                  <tr
                    key={r.shipmentId}
                    className={
                      isDiscrepancy
                        ? "border-l-[3px] border-l-danger bg-danger-weak/40"
                        : "border-t border-border"
                    }
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs font-semibold text-ink">
                        {r.consignmentId ?? "—"}
                      </span>
                      <span className="ml-2 font-mono text-2xs text-ink-subtle">#{r.orderNumber}</span>
                      <div className="text-2xs text-ink-muted">{r.customerName ?? "—"}</div>
                      {missing && (
                        <div className="mt-0.5 text-2xs font-semibold text-danger">
                          {t.missingRemittance}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink">{formatMoney(r.expected, locale)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink-muted">
                      {r.collected == null ? "—" : formatMoney(r.collected, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink-muted">
                      {r.remitted == null ? "—" : formatMoney(r.remitted, locale)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DeltaAmount amount={r.discrepancy} missing={missing} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge kind="cod" value={r.codStatus} lang={locale} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isDiscrepancy && <ResolveButton shipmentId={r.shipmentId} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Q3.3 Remittance batch list. */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">{t.batchesHeading}</h2>
        {batches.length === 0 ? (
          <EmptyState
            title={t.emptyBatches.title}
            hint={t.emptyBatches.hint}
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {batches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-ink">{b.reference ?? b.id.slice(0, 8)}</span>
                  <span className="ml-2 text-2xs uppercase text-ink-muted">{b.provider}</span>
                  <div className="text-2xs text-ink-muted">
                    {new Date(b.createdAt).toLocaleDateString("en-GB")}
                    {b.unmatchedCount > 0 && (
                      <span className="ml-2 text-warning">{t.unmatched}: {formatNumber(b.unmatchedCount, locale)}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-semibold tnum text-ink">{formatMoney(b.totalAmount, locale)}</div>
                  <span className="text-2xs text-ink-muted">{b.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-md bg-surface-2 px-3 py-2 text-2xs text-ink-muted">
        {t.footnote}
      </p>
    </div>
  );
}
