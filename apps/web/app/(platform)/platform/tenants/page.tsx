import Link from "next/link";
import { listTenants } from "@/lib/platform/data";
import { TenantActions } from "../TenantActions";

// Super-admin store directory ("Homies-Lab" console skin). Lists every tenant
// with owner, plan, lifecycle status, trial end; suspend/reactivate/impersonate
// per row (TenantActions, server-action backed). Authz via the platform layout.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

export default async function PlatformStores() {
  const tenants = await listTenants();
  const count = (s: string) => tenants.filter((t) => t.status === s).length;
  const chips = [
    { label: "Total", value: tenants.length },
    { label: "Active", value: count("active") },
    { label: "Trial", value: count("trial") },
    { label: "Past due", value: count("past_due") },
    { label: "Suspended", value: count("suspended") },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[var(--pf-muted)]">
          Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
          <span className="text-[var(--pf-ink)]">Stores</span>
        </p>
        <span className="rounded-full bg-[var(--pf-yellow-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pf-yellow-deep)]">
          {tenants.length} stores
        </span>
      </div>

      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">Stores</h1>
        <p className="mt-1 text-[13px] text-[var(--pf-muted)]">Every seller on Hybrid — lifecycle, plan and quick controls.</p>
      </div>

      {/* Lifecycle summary chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {chips.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-panel)] p-3.5">
            <p className="text-[22px] font-bold leading-none text-[var(--pf-ink)]">{c.value}</p>
            <p className="mt-1 text-[11px] text-[var(--pf-muted)]">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Directory table */}
      <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
        {tenants.length === 0 ? (
          <p className="py-12 text-center text-[14px] text-[var(--pf-muted)]">No stores yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="pb-2.5 font-semibold">Store</th>
                  <th className="pb-2.5 font-semibold">Owner</th>
                  <th className="pb-2.5 font-semibold">Plan</th>
                  <th className="pb-2.5 font-semibold">Subscription</th>
                  <th className="pb-2.5 font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Trial ends</th>
                  <th className="pb-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {tenants.map((t) => (
                  <tr key={t.id} className="border-t border-[var(--pf-border)] align-middle">
                    <td className="py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={t.name} />
                        <span className="min-w-0">
                          <Link href={`/platform/tenants/${t.id}`} className="block font-semibold text-[var(--pf-ink)] hover:underline">
                            {t.name}
                          </Link>
                          <span className="block font-mono text-[11px] text-[var(--pf-subtle)]">{t.slug}.{ROOT}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-3 text-[var(--pf-muted)]">{t.ownerName ?? t.ownerEmail ?? "—"}</td>
                    <td className="py-3 text-[var(--pf-muted)]">{t.planName ?? "—"}</td>
                    <td className="py-3 capitalize text-[var(--pf-muted)]">{t.subscriptionStatus ?? "—"}</td>
                    <td className="py-3"><StatusBadge status={t.status} /></td>
                    <td className="py-3 font-mono text-[12px] text-[var(--pf-muted)]">{fmtDate(t.trialEndsAt)}</td>
                    <td className="py-3">
                      <div className="flex justify-end">
                        <TenantActions tenantId={t.id} status={t.status} rootDomain={ROOT} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(iso));
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pf-yellow-soft)] text-[12px] font-bold text-[var(--pf-yellow-deep)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-[#e6f6ee] text-[var(--pf-success)]",
    trial: "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]",
    past_due: "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]",
    suspended: "bg-[#fde9e8] text-[var(--pf-danger)]",
    cancelled: "bg-[#f0ede4] text-[var(--pf-muted)]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${map[status] ?? "bg-[#f0ede4] text-[var(--pf-muted)]"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
