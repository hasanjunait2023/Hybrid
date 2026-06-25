import { Badge } from "@hybrid/ui";
import { listTenants, type TenantDirectoryRow } from "@/lib/platform/data";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import type { Messages } from "@/lib/i18n/dictionaries";
import { TenantActions } from "../TenantActions";

// Super-admin tenant directory (blueprint S-PLATFORM). Lists every tenant with
// owner, plan, lifecycle status, and trial end. Suspend/reactivate + impersonate
// per row; the name links to the tenant-360 detail. Authz via the layout.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "trial" || status === "past_due") return "warning";
  if (status === "suspended" || status === "cancelled") return "danger";
  return "neutral";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA");
}

function TenantRow({ t, d }: { t: TenantDirectoryRow; d: Messages }) {
  const tx = d.platform.tenants;
  return (
    <li className="rounded-lg border border-border bg-surface p-3 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <a href={`/platform/tenants/${t.id}`} className="truncate text-sm font-semibold text-ink hover:text-primary hover:underline">
              {t.name}
            </a>
            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
          </div>
          <div className="mt-1 font-mono text-2xs text-ink-subtle">{t.slug}.{ROOT}</div>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-2xs text-ink-muted sm:grid-cols-4">
            <div><dt className="text-ink-subtle">{tx.owner}</dt><dd className="truncate text-ink">{t.ownerName ?? t.ownerEmail ?? "—"}</dd></div>
            <div><dt className="text-ink-subtle">{tx.plan}</dt><dd className="text-ink">{t.planName ?? "—"}</dd></div>
            <div><dt className="text-ink-subtle">{tx.subscription}</dt><dd className="text-ink">{t.subscriptionStatus ?? "—"}</dd></div>
            <div><dt className="text-ink-subtle">{tx.trialEnds}</dt><dd className="font-mono text-ink tnum">{fmtDate(t.trialEndsAt)}</dd></div>
          </dl>
        </div>
        <TenantActions tenantId={t.id} status={t.status} rootDomain={ROOT} />
      </div>
    </li>
  );
}

export default async function PlatformDirectory() {
  const tenants = await listTenants();
  const { locale, d } = await getDict();
  const tx = d.platform.tenants;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a href="/platform" className="text-sm font-medium text-ink-muted hover:text-primary">{d.platform.common.backToDashboard}</a>
          <h1 className="mt-1 text-xl font-bold text-ink">{tx.title}</h1>
        </div>
        <span className="font-mono text-sm text-ink-muted tnum">{formatNumber(tenants.length, locale)} {tx.storesUnit}</span>
      </div>

      {tenants.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-ink-muted">{tx.empty}</p>
      ) : (
        <ul className="space-y-2">{tenants.map((t) => <TenantRow key={t.id} t={t} d={d} />)}</ul>
      )}
    </div>
  );
}
