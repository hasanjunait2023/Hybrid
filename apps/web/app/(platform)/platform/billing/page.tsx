import { getBillingOverview, listSubscriptions, listInvoices } from "@/lib/platform/billing";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { BillingControls, ExtendTrial, MarkPaid } from "./BillingControls";

// Platform billing & subscriptions (PP1-A3). Revenue overview, subscription
// roster, open/overdue invoices, manual overrides + sweep. "Homies-Lab" console
// skin. Authz via layout.
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
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Billing</span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">{tx.title}</h1>
          <p className="mt-1 text-[13px] text-[var(--pf-muted)]">Subscriptions, recurring revenue and invoices.</p>
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
      <section className="overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)]">
        <h2 className="border-b border-[var(--pf-border)] px-4 py-3 text-[14px] font-bold text-[var(--pf-ink)]">{tx.subscriptions}</h2>
        {subs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--pf-muted)]">{tx.noSubscriptions}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--pf-border)] text-left text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="px-4 py-2.5 font-semibold">{tx.store}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.plan}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.status}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{tx.mrr}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.periodEnd}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.action}</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.tenantId} className="border-t border-[var(--pf-border)]">
                    <td className="px-4 py-3">
                      <a href={`/platform/tenants/${s.tenantId}`} className="font-semibold text-[var(--pf-ink)] hover:underline">{s.tenantName}</a>
                    </td>
                    <td className="px-4 py-3 text-[var(--pf-muted)]">{s.plan ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        s.status === "active" ? "bg-[#e6f6ee] text-[var(--pf-success)]"
                          : s.status === "past_due" ? "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]"
                          : s.status === "trialing" ? "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]"
                          : "bg-[#f0ede4] text-[var(--pf-muted)]"}`}>
                        {s.status}{s.cancelAtPeriodEnd ? " ⊘" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--pf-ink)]">{s.mrr > 0 ? formatMoney(s.mrr, locale) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--pf-muted)]">{fmtDate(s.periodEnd)}</td>
                    <td className="px-4 py-3"><ExtendTrial tenantId={s.tenantId} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Open invoices */}
      <section className="overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)]">
        <h2 className="border-b border-[var(--pf-border)] px-4 py-3 text-[14px] font-bold text-[var(--pf-ink)]">{tx.openInvoices}</h2>
        {openInvoices.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--pf-muted)]">{tx.noOpenInvoices}</p>
        ) : (
          <ul className="divide-y divide-[var(--pf-border)]">
            {openInvoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--pf-ink)]">{inv.tenantName}</span>
                <span className="font-mono text-[13px] font-semibold text-[var(--pf-ink)]">{formatMoney(inv.amount, locale)}</span>
                <span className="text-[11px] text-[var(--pf-subtle)]">{tx.due} {fmtDate(inv.dueAt)}</span>
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
  const v = tone === "danger" ? "text-[var(--pf-danger)]" : tone === "warning" ? "text-[var(--pf-yellow-deep)]" : "text-[var(--pf-ink)]";
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-[var(--pf-yellow)] bg-gradient-to-br from-[#fdf4d4] to-[#fbe6a8]" : "border-[var(--pf-border)] bg-[var(--pf-panel)]"}`}>
      <p className="text-[12px] text-[var(--pf-muted)]">{label}</p>
      <p className={`mt-1.5 text-[22px] font-bold leading-none ${accent ? "text-[var(--pf-ink)]" : v}`}>{value}</p>
    </div>
  );
}
