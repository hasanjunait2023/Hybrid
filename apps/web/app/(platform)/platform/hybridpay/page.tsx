import {
  getHybridpayOverview,
  listHybridpayTenants,
  listRecentHybridpayPayments,
} from "@/lib/platform/hybridpay";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";

// Platform Hybrid Pay console. The founder's ops surface for the white-label
// gateway: per-tenant onboarding state (brand + API key + domain whitelist are
// manual PipraPay-admin steps), and the live money flow once tenants are wired.
// Authz via layout.
export const dynamic = "force-dynamic";

const ENGINE_URL = process.env.HYBRIDPAY_BASE_URL ?? "https://pay.hybrid.ecomex.cloud";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-CA") : "—";
}

export default async function HybridpayPage() {
  const [overview, tenants, payments] = await Promise.all([
    getHybridpayOverview(),
    listHybridpayTenants(),
    listRecentHybridpayPayments(),
  ]);

  const { locale, d } = await getDict();
  const tx = d.platform.hybridpay;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Hybrid Pay</span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">{tx.title}</h1>
          <p className="mt-1 text-[13px] text-[var(--pf-muted)]">{tx.subtitle}</p>
        </div>
        <a
          href={ENGINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-[var(--pf-black)] px-4 py-2 text-[13px] font-semibold text-[var(--pf-on-black)] hover:opacity-90"
        >
          {tx.openEngine} ↗
        </a>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tx.enabledTenants} value={`${formatNumber(overview.enabled, locale)} / ${formatNumber(overview.configured, locale)}`} accent />
        <Stat
          label={tx.awaitingOnboarding}
          value={formatNumber(overview.awaitingOnboarding, locale)}
          tone={overview.awaitingOnboarding > 0 ? "warning" : undefined}
        />
        <Stat label={tx.volume30d} value={formatMoney(overview.success30dVolume, locale)} />
        <Stat
          label={tx.failed30d}
          value={formatNumber(overview.failed30dCount, locale)}
          tone={overview.failed30dCount > 0 ? "danger" : undefined}
        />
      </section>

      {/* Onboarding roster */}
      <section className="overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)]">
        <div className="border-b border-[var(--pf-border)] px-4 py-3">
          <h2 className="text-[14px] font-bold text-[var(--pf-ink)]">{tx.roster}</h2>
          <p className="mt-0.5 text-[12px] text-[var(--pf-muted)]">{tx.rosterHint}</p>
        </div>
        {tenants.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--pf-muted)]">{tx.noTenants}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--pf-border)] text-left text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="px-4 py-2.5 font-semibold">{tx.store}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.onboarding}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.whitelistDomain}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{tx.received}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{tx.pendingFailed}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.lastPaid}</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.tenantId} className="border-t border-[var(--pf-border)]">
                    <td className="px-4 py-3">
                      <a href={`/platform/tenants/${t.tenantId}`} className="font-semibold text-[var(--pf-ink)] hover:underline">
                        {t.tenantName}
                      </a>
                      <span className="ml-2 text-[11px] text-[var(--pf-subtle)]">{t.slug}</span>
                    </td>
                    <td className="px-4 py-3">
                      {t.accountEnabled === true ? (
                        <Badge tone="success">{tx.stateEnabled}</Badge>
                      ) : t.accountEnabled === false ? (
                        <Badge tone="warning">{tx.stateDisabled}</Badge>
                      ) : (
                        <Badge tone="muted">{tx.stateNotOnboarded}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--pf-muted)]">
                      {t.webhookDomain ?? tx.noDomain}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--pf-ink)]">
                      {t.successCount > 0
                        ? `${formatMoney(t.successVolume, locale)} (${formatNumber(t.successCount, locale)})`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] text-[var(--pf-muted)]">
                      {t.pendingCount} / {t.failedCount}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--pf-muted)]">{fmtDate(t.lastPaidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent payments */}
      <section className="overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)]">
        <h2 className="border-b border-[var(--pf-border)] px-4 py-3 text-[14px] font-bold text-[var(--pf-ink)]">
          {tx.recentPayments}
        </h2>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--pf-muted)]">{tx.noPayments}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--pf-border)] text-left text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="px-4 py-2.5 font-semibold">{tx.store}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.order}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{tx.amount}</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.status}</th>
                  <th className="px-4 py-2.5 font-semibold">pp_id</th>
                  <th className="px-4 py-2.5 font-semibold">{tx.date}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.paymentId} className="border-t border-[var(--pf-border)]">
                    <td className="px-4 py-3 text-[var(--pf-ink)]">{p.tenantName}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--pf-muted)]">
                      {p.orderNumber != null ? `#${p.orderNumber}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--pf-ink)]">
                      {formatMoney(p.amount, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={p.status === "success" ? "success" : p.status === "pending" ? "warning" : "danger"}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[var(--pf-subtle)]">{p.providerRef ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--pf-muted)]">{fmtDate(p.paidAt ?? p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Onboarding runbook (the manual PipraPay-admin steps) */}
      <section className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
        <h2 className="text-[14px] font-bold text-[var(--pf-ink)]">{tx.runbookTitle}</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] text-[var(--pf-muted)]">
          <li>{tx.runbook1}</li>
          <li>{tx.runbook2}</li>
          <li>{tx.runbook3}</li>
          <li>{tx.runbook4}</li>
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, accent = false, tone }: { label: string; value: string; accent?: boolean; tone?: "warning" | "danger" }) {
  const v = tone === "danger" ? "text-[var(--pf-danger)]" : tone === "warning" ? "text-[var(--pf-yellow-deep)]" : "text-[var(--pf-ink)]";
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-[var(--pf-yellow)] bg-gradient-to-br from-[var(--pf-grad-gold-1)] to-[var(--pf-grad-gold-2)]" : "border-[var(--pf-border)] bg-[var(--pf-panel)]"}`}>
      <p className="text-[12px] text-[var(--pf-muted)]">{label}</p>
      <p className={`mt-1.5 text-[22px] font-bold leading-none ${accent ? "text-[var(--pf-ink)]" : v}`}>{value}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "success"
      ? "bg-[var(--pf-success-weak)] text-[var(--pf-success)]"
      : tone === "warning"
        ? "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]"
        : tone === "danger"
          ? "bg-[var(--pf-danger-weak,rgba(220,38,38,0.1))] text-[var(--pf-danger)]"
          : "bg-[var(--pf-muted-weak)] text-[var(--pf-muted)]";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {children}
    </span>
  );
}
