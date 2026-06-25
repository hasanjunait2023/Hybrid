import { getBillingOverview, listSubscriptions, listInvoices } from "@/lib/platform/billing";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { BillingControls, ExtendTrial, MarkPaid } from "./BillingControls";

// Platform billing & subscriptions (PP1-A3). Revenue overview, subscription
// roster, open/overdue invoices, manual overrides + sweep. Authz via layout.
export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-CA") : "—";
}

export default async function BillingPage() {
  const [overview, subs, openInvoices] = await Promise.all([
    getBillingOverview(),
    listSubscriptions(),
    listInvoices("open"),
  ]);

  const { locale, d } = await getDict();
  const tx = d.platform.billing;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a href="/platform" className="text-sm font-medium text-ink-muted hover:text-primary">{d.platform.common.backToDashboard}</a>
          <h1 className="mt-1 text-xl font-bold text-ink">{tx.title}</h1>
        </div>
        <BillingControls />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tx.mrr} value={formatMoney(overview.mrr, locale)} accent />
        <Stat label={tx.trialActive} value={`${formatNumber(overview.trialing, locale)} / ${formatNumber(overview.active, locale)}`} />
        <Stat label={tx.pastDueSubscriptions} value={formatNumber(overview.pastDue, locale)} tone={overview.pastDue > 0 ? "warning" : undefined} />
        <Stat label={tx.overdueInvoices} value={formatMoney(overview.overdueAmount, locale)} tone={overview.overdueAmount > 0 ? "danger" : undefined} />
      </section>

      {/* Subscriptions */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">{tx.subscriptions}</h2>
        {subs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">{tx.noSubscriptions}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-semibold">{tx.store}</th>
                <th className="px-4 py-2 font-semibold">{tx.plan}</th>
                <th className="px-4 py-2 font-semibold">{tx.status}</th>
                <th className="px-4 py-2 text-right font-semibold">{tx.mrr}</th>
                <th className="px-4 py-2 font-semibold">{tx.periodEnd}</th>
                <th className="px-4 py-2 font-semibold">{tx.action}</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s, i) => (
                <tr key={s.tenantId} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                  <td className="px-4 py-2">
                    <a href={`/platform/tenants/${s.tenantId}`} className="font-medium text-ink hover:text-primary hover:underline">{s.tenantName}</a>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{s.plan ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                      s.status === "active" ? "bg-success-weak text-success"
                        : s.status === "past_due" ? "bg-warning-weak text-warning"
                        : s.status === "trialing" ? "bg-st-pending-weak text-st-pending"
                        : "bg-surface-2 text-ink-muted"}`}>
                      {s.status}{s.cancelAtPeriodEnd ? " ⊘" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-ink tnum">{s.mrr > 0 ? formatMoney(s.mrr, locale) : "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted tnum">{fmtDate(s.periodEnd)}</td>
                  <td className="px-4 py-2"><ExtendTrial tenantId={s.tenantId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Open invoices */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">{tx.openInvoices}</h2>
        {openInvoices.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">{tx.noOpenInvoices}</p>
        ) : (
          <ul className="divide-y divide-border">
            {openInvoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{inv.tenantName}</span>
                <span className="font-mono text-sm font-semibold text-ink tnum">{formatMoney(inv.amount, locale)}</span>
                <span className="text-2xs text-ink-subtle">{tx.due} {fmtDate(inv.dueAt)}</span>
                <MarkPaid invoiceId={inv.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent = false, tone }: { label: string; value: string; accent?: boolean; tone?: "warning" | "danger" }) {
  const v = accent ? "text-primary" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <div className={`rounded-lg border p-4 shadow-xs ${accent ? "border-primary bg-primary-weak" : "border-border bg-surface"}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none tnum ${v}`}>{value}</p>
    </div>
  );
}
