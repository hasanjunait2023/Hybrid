// Order risk panel (tenant roadmap P1 #2). Shows the COD-fraud signals computed
// from the tenant's own history (blocked phone, recent duplicates, prior
// cancels/returns, RTO rate) plus the external phone-risk lookup when a provider
// credential is configured. Server component — calls the data layer directly.
import { getOrderRiskSignals, getExternalPhoneRisk } from "@/lib/admin/fraud";
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
  const external = await getExternalPhoneRisk(risk.phone);

  // High risk = blocked, or a recent duplicate, or >40% of prior orders bad.
  const highRisk = risk.blocked || risk.duplicateRecent > 0 || (risk.priorOrders >= 2 && risk.rtoRate > 0.4);

  return (
    <section
      className={`rounded-lg border p-4 shadow-xs ${highRisk ? "border-danger bg-danger-weak" : "border-border bg-surface"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className={`text-sm font-bold ${highRisk ? "text-danger" : "text-ink"}`}>
          ঝুঁকি যাচাই
        </h2>
        <BlockPhoneButton phone={risk.phone} blocked={risk.blocked} />
      </div>

      {risk.blocked && (
        <p className="mt-2 rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-ink-on-primary">
          এই নম্বর ব্লক করা — সতর্ক থাকুন।
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="আগের অর্ডার" value={String(risk.priorOrders)} />
        <Stat label="২৪ঘ-এ ডুপ্লিকেট" value={String(risk.duplicateRecent)} warn={risk.duplicateRecent > 0} />
        <Stat label="বাতিল" value={String(risk.priorCancelled)} warn={risk.priorCancelled > 0} />
        <Stat label="ফেরত / RTO" value={String(risk.priorReturned)} warn={risk.priorReturned > 0} />
        {risk.priorOrders >= 1 && (
          <Stat label="RTO রেট" value={pct(risk.rtoRate)} warn={risk.rtoRate > 0.4} />
        )}
        {external.configured && external.successRatio !== undefined && (
          <Stat label="কুরিয়ার সাকসেস" value={pct(external.successRatio)} warn={external.successRatio < 0.6} />
        )}
      </dl>

      {!external.configured && (
        <p className="mt-3 text-2xs text-ink-subtle">
          বাহ্যিক ফ্রড-চেক চালু নেই — শুধু আপনার নিজের অর্ডার ইতিহাস থেকে সংকেত দেখানো হচ্ছে।
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
