import Link from "next/link";
import { getPlatformStats } from "@/lib/platform/analytics";
import { listTenants } from "@/lib/platform/data";

// Sales pipeline (signup funnel). The platform's acquisition view: signups →
// trials → paid, plus the live trial book sorted by urgency (soonest-expiring
// first) so the operator knows which sellers to convert next. Authz via layout.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";
const DHAKA = "Asia/Dhaka";

export default async function PlatformSales() {
  const [s, tenants] = await Promise.all([getPlatformStats(), listTenants()]);

  const trials = tenants
    .filter((t) => t.status === "trial")
    .sort((a, b) => (a.trialEndsAt ?? "").localeCompare(b.trialEndsAt ?? ""));
  const paid = s.tenants.active;
  const convBase = s.tenants.active + s.tenants.trial;
  const conversion = convBase > 0 ? Math.round((paid / convBase) * 100) : 0;

  const funnel = [
    { label: "Signups (30d)", value: s.signups30d, hint: "New stores created" },
    { label: "Active trials", value: s.tenants.trial, hint: "In trial now" },
    { label: "Paid stores", value: paid, hint: "Converted to a plan" },
    { label: "Trial → Paid", value: `${conversion}%`, hint: "Conversion rate", accent: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[var(--pf-muted)]">
          Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
          <span className="text-[var(--pf-ink)]">Sales pipeline</span>
        </p>
      </div>

      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">Sales pipeline</h1>
        <p className="mt-1 text-[13px] text-[var(--pf-muted)]">Turn signups into paying stores — track the funnel and work the trial book.</p>
      </div>

      {/* Funnel */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {funnel.map((f) => (
          <div
            key={f.label}
            className={`rounded-2xl border p-4 ${f.accent ? "border-[var(--pf-yellow)] bg-gradient-to-br from-[var(--pf-grad-gold-1)] to-[var(--pf-grad-gold-2)]" : "border-[var(--pf-border)] bg-[var(--pf-panel)]"}`}
          >
            <p className="text-[26px] font-bold leading-none text-[var(--pf-ink)]">{f.value}</p>
            <p className="mt-1.5 text-[12.5px] font-semibold text-[var(--pf-ink)]">{f.label}</p>
            <p className="mt-0.5 text-[11px] text-[var(--pf-muted)]">{f.hint}</p>
          </div>
        ))}
      </section>

      {/* Trial book */}
      <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Trials to convert</h2>
          <span className="rounded-full bg-[var(--pf-yellow-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pf-yellow-deep)]">
            {trials.length} open
          </span>
        </div>
        {trials.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-[var(--pf-muted)]">No active trials. New signups will land here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="pb-2.5 font-semibold">Store</th>
                  <th className="pb-2.5 font-semibold">Owner</th>
                  <th className="pb-2.5 font-semibold">Plan</th>
                  <th className="pb-2.5 font-semibold">Trial ends</th>
                  <th className="pb-2.5 font-semibold">Urgency</th>
                  <th className="pb-2.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {trials.map((t) => {
                  const days = daysLeft(t.trialEndsAt);
                  return (
                    <tr key={t.id} className="border-t border-[var(--pf-border)] align-middle">
                      <td className="py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={t.name} />
                          <span className="min-w-0">
                            <span className="block font-semibold text-[var(--pf-ink)]">{t.name}</span>
                            <span className="block font-mono text-[11px] text-[var(--pf-subtle)]">{t.slug}.{ROOT}</span>
                          </span>
                        </span>
                      </td>
                      <td className="py-3 text-[var(--pf-muted)]">{t.ownerEmail ?? t.ownerName ?? "—"}</td>
                      <td className="py-3 text-[var(--pf-muted)]">{t.planName ?? "—"}</td>
                      <td className="py-3 font-mono text-[12px] text-[var(--pf-muted)]">{fmtDate(t.trialEndsAt)}</td>
                      <td className="py-3"><Urgency days={days} /></td>
                      <td className="py-3 text-right">
                        <Link href={`/platform/tenants/${t.id}`} className="rounded-lg border border-[var(--pf-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pf-ink)] hover:bg-[var(--pf-hover)]">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function Urgency({ days }: { days: number | null }) {
  if (days === null) return <span className="text-[12px] text-[var(--pf-subtle)]">—</span>;
  const expired = days <= 0;
  const hot = days <= 3;
  const cls = expired
    ? "bg-[var(--pf-danger-weak)] text-[var(--pf-danger)]"
    : hot
      ? "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]"
      : "bg-[var(--pf-success-weak)] text-[var(--pf-success)]";
  const label = expired ? "Expired" : `${days}d left`;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pf-yellow-soft)] text-[12px] font-bold text-[var(--pf-yellow-deep)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: DHAKA }).format(new Date(iso));
}
