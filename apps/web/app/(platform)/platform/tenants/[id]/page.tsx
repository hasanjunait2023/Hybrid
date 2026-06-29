import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDetail } from "@/lib/platform/tenant-detail";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { TenantActions } from "../../TenantActions";

// Tenant 360 (PP1-A2). Full platform view of one store. "Homies-Lab" console
// skin. Authz via layout.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTenantDetail(id);
  if (!t) notFound();

  const { locale, d } = await getDict();
  const tx = d.platform.tenantDetail;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <Link href="/platform/tenants" className="hover:text-[var(--pf-ink)]">Stores</Link>
        <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">{t.name}</span>
      </p>

      {/* Header card */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--pf-border)] bg-gradient-to-br from-[var(--pf-grad-warm-1)] to-[var(--pf-grad-warm-2)] p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--pf-yellow-soft)] text-[18px] font-bold text-[var(--pf-yellow-deep)]">
            {t.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight text-[var(--pf-ink)]">{t.name}</h1>
              <StatusBadge status={t.status} />
            </div>
            <p className="mt-0.5 font-mono text-[12px] text-[var(--pf-subtle)]">{t.slug}.{ROOT}</p>
            <p className="mt-0.5 text-[11px] text-[var(--pf-muted)]">{tx.created}: {fmtDate(t.createdAt)}</p>
          </div>
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
        <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-5">
          <h2 className="mb-3 text-[14px] font-bold text-[var(--pf-ink)]">{tx.planAndSubscription}</h2>
          <dl className="space-y-2.5 text-[13px]">
            <Row label={tx.plan} value={t.plan?.name ?? "—"} />
            <Row label={tx.monthlyPrice} value={t.plan ? formatMoney(t.plan.priceBdt, locale) : "—"} mono />
            <Row label={tx.subscription} value={t.subscription?.status ?? "—"} />
            <Row label={tx.periodEnd} value={fmtDate(t.subscription?.periodEnd ?? null)} mono />
            <Row label={tx.owner} value={t.owner?.name ?? t.owner?.email ?? "—"} />
          </dl>
        </div>

        <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-5">
          <h2 className="mb-3 text-[14px] font-bold text-[var(--pf-ink)]">{tx.usageVsLimits}</h2>
          <div className="space-y-3.5">
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
    <div className="rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
      <p className="text-[12px] text-[var(--pf-muted)]">{label}</p>
      <p className="mt-1.5 text-[20px] font-bold leading-none text-[var(--pf-ink)]">{value}</p>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--pf-muted)]">{label}</dt>
      <dd className={`font-semibold text-[var(--pf-ink)] ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function UsageBar({ label, used, limit, locale }: { label: string; used: number; limit: number | null; locale: Locale }) {
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const over = !unlimited && used > limit;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[var(--pf-muted)]">{label}</span>
        <span className={`font-mono ${over ? "font-semibold text-[var(--pf-danger)]" : "text-[var(--pf-ink)]"}`}>
          {formatNumber(used, locale)}{unlimited ? " / ∞" : ` / ${formatNumber(limit, locale)}`}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--pf-track)]">
          <div className={`h-full rounded-full ${over ? "bg-[var(--pf-danger)]" : "bg-[var(--pf-yellow)]"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-[var(--pf-success-weak)] text-[var(--pf-success)]",
    trial: "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]",
    past_due: "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]",
    suspended: "bg-[var(--pf-danger-weak)] text-[var(--pf-danger)]",
    cancelled: "bg-[var(--pf-muted-weak)] text-[var(--pf-muted)]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${map[status] ?? "bg-[var(--pf-muted-weak)] text-[var(--pf-muted)]"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
