import { notFound } from "next/navigation";
import { Badge } from "@hybrid/ui";
import { getTenantDetail } from "@/lib/platform/tenant-detail";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { TenantActions } from "../../TenantActions";

// Tenant 360 (PP1-A2). Full platform view of one store. Authz via layout.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
  if (s === "active") return "success";
  if (s === "trial" || s === "past_due") return "warning";
  if (s === "suspended" || s === "cancelled") return "danger";
  return "neutral";
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-CA") : "—";
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTenantDetail(id);
  if (!t) notFound();

  const { locale, d } = await getDict();
  const tx = d.platform.tenantDetail;

  return (
    <div className="space-y-5">
      <a href="/platform/tenants" className="text-sm font-medium text-ink-muted hover:text-primary">{tx.backToDirectory}</a>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-ink">{t.name}</h1>
            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
          </div>
          <p className="mt-1 font-mono text-2xs text-ink-subtle">{t.slug}.{ROOT}</p>
          <p className="mt-1 text-2xs text-ink-muted">{tx.created}: {fmtDate(t.createdAt)}</p>
        </div>
        <TenantActions tenantId={t.id} status={t.status} rootDomain={ROOT} />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tx.gmvAllTime} value={formatMoney(t.gmvAllTime, locale)} />
        <Stat label={tx.gmv30d} value={formatMoney(t.gmv30d, locale)} />
        <Stat label={tx.totalOrders} value={formatNumber(t.ordersAllTime, locale)} />
        <Stat label={tx.customers} value={formatNumber(t.usage.customers, locale)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Plan + subscription */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 className="mb-3 text-sm font-bold text-ink">{tx.planAndSubscription}</h2>
          <dl className="space-y-2 text-sm">
            <Row label={tx.plan} value={t.plan?.name ?? "—"} />
            <Row label={tx.monthlyPrice} value={t.plan ? formatMoney(t.plan.priceBdt, locale) : "—"} mono />
            <Row label={tx.subscription} value={t.subscription?.status ?? "—"} />
            <Row label={tx.periodEnd} value={fmtDate(t.subscription?.periodEnd ?? null)} mono />
            <Row label={tx.owner} value={t.owner?.name ?? t.owner?.email ?? "—"} />
          </dl>
        </div>

        {/* Usage vs limits */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 className="mb-3 text-sm font-bold text-ink">{tx.usageVsLimits}</h2>
          <div className="space-y-3">
            <UsageBar label={tx.products} used={t.usage.products} limit={t.plan?.maxProducts ?? null} locale={locale} />
            <UsageBar label={tx.ordersThisMonth} used={t.usage.ordersThisMonth} limit={t.plan?.maxOrdersMonth ?? null} locale={locale} />
            <UsageBar label={tx.staff} used={t.usage.members} limit={t.plan?.maxStaff ?? null} locale={locale} />
            <Row label={tx.customDomain} value={formatNumber(t.usage.domains, locale)} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-ink tnum">{value}</p>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`font-semibold text-ink ${mono ? "font-mono tnum" : ""}`}>{value}</dd>
    </div>
  );
}

function UsageBar({ label, used, limit, locale }: { label: string; used: number; limit: number | null; locale: Locale }) {
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const over = !unlimited && used > limit;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className={`font-mono tnum ${over ? "text-danger font-semibold" : "text-ink"}`}>
          {formatNumber(used, locale)}{unlimited ? " / ∞" : ` / ${formatNumber(limit, locale)}`}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${over ? "bg-danger" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
