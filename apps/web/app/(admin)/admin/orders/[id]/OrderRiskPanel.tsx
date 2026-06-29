// Order risk panel (tenant roadmap P1 #2). Shows the COD-fraud signals computed
// from the tenant's own history (blocked phone, recent duplicates, prior
// cancels/returns, RTO rate) plus the external phone-risk lookup when a provider
// credential is configured. Server component — calls the data layer directly.
import { getOrderRiskSignals, getExternalPhoneRisk, getNetworkPhoneRisk, scorePhoneRisk } from "@/lib/admin/fraud";
import { getDict } from "@/lib/i18n/server";
import { BlockPhoneButton } from "./BlockPhoneButton";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export async function OrderRiskPanel({
  tenantId,
  userId,
  orderId,
}: {
  tenantId: string;
  userId: string;
  orderId: string;
}) {
  const risk = await getOrderRiskSignals(tenantId, userId, orderId);
  if (!risk.phone) return null;
  const [external, network] = await Promise.all([
    getExternalPhoneRisk(risk.phone),
    getNetworkPhoneRisk(risk.phone, tenantId),
  ]);

  const { d } = await getDict();
  const t = d.admin.ordersDetail.risk;

  // Composite verdict over local history + network + external lookup.
  const verdict = scorePhoneRisk({ local: risk, external, network });
  const tone =
    verdict.level === "high"
      ? { border: "border-danger bg-danger-weak", head: "text-danger", chip: "bg-danger text-ink-on-primary" }
      : verdict.level === "medium"
        ? { border: "border-warning bg-warning-weak", head: "text-warning", chip: "bg-warning text-ink-on-primary" }
        : { border: "border-border bg-surface", head: "text-ink", chip: "bg-success-weak text-success" };

  return (
    <section className={`rounded-lg border p-4 shadow-xs ${tone.border}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className={`text-sm font-bold ${tone.head}`}>{t.heading}</h2>
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${tone.chip}`}>
            {t.level[verdict.level]}
          </span>
        </div>
        <BlockPhoneButton phone={risk.phone} blocked={risk.blocked} />
      </div>

      {verdict.reasons.length > 0 && (
        <p className="mt-2 text-2xs text-ink-muted">
          {verdict.reasons.map((r) => t.reason[r as keyof typeof t.reason] ?? r).join(" · ")}
        </p>
      )}

      {risk.blocked && (
        <p className="mt-2 rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-ink-on-primary">
          {t.blockedWarning}
        </p>
      )}

      {network.storesFlagged > 0 && (
        <p className="mt-2 rounded-md bg-warning-weak px-3 py-1.5 text-xs font-semibold text-warning">
          {t.networkFlagged.replace("{n}", String(network.storesFlagged))}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label={t.priorOrders} value={String(risk.priorOrders)} />
        <Stat label={t.duplicate24h} value={String(risk.duplicateRecent)} warn={risk.duplicateRecent > 0} />
        <Stat label={t.cancelled} value={String(risk.priorCancelled)} warn={risk.priorCancelled > 0} />
        <Stat label={t.returnedRto} value={String(risk.priorReturned)} warn={risk.priorReturned > 0} />
        {risk.priorOrders >= 1 && (
          <Stat label={t.rtoRate} value={pct(risk.rtoRate)} warn={risk.rtoRate > 0.4} />
        )}
        {external.configured && external.successRatio !== undefined && (
          <Stat label={t.courierSuccess} value={pct(external.successRatio)} warn={external.successRatio < 0.6} />
        )}
      </dl>

      {!external.configured && (
        <p className="mt-3 text-2xs text-ink-subtle">
          {t.externalDisabled}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-2xs text-ink-muted">{label}</dt>
      <dd className={`font-mono text-base font-bold tnum ${warn ? "text-danger" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
