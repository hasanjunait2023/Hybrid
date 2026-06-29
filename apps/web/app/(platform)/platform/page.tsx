import Link from "next/link";
import { getPlatformStats, getWholesaleStats, type PlatformStats, type WholesaleStats } from "@/lib/platform/analytics";
import { listTenants, type TenantDirectoryRow } from "@/lib/platform/data";
import { BoxesIcon, CheckCircleIcon, ReceiptIcon, UsersIcon, TruckIcon } from "@hybrid/ui";

// Platform owner dashboard — "Homies-Lab" console skin (operator-facing, Latin
// numerals, English). Hybrid's business across every tenant: store counts,
// MRR/ARR/ARPU, GMV, signups, conversion, lifecycle. Authz via the layout.
export const dynamic = "force-dynamic";

const DHAKA = "Asia/Dhaka";

export default async function PlatformDashboard() {
  const [s, tenants, ws] = await Promise.all([getPlatformStats(), listTenants(), getWholesaleStats()]);

  const dateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: DHAKA,
  }).format(new Date());

  const total = s.tenants.total;
  const liveRate = total > 0 ? Math.round((s.liveStores / total) * 100) : 0;
  const convBase = s.tenants.active + s.tenants.trial;
  const conversion = convBase > 0 ? Math.round((s.tenants.active / convBase) * 100) : 0;
  const arpu = s.tenants.active > 0 ? Math.round(s.mrr / s.tenants.active) : 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[var(--pf-muted)]">
          Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
          <span className="text-[var(--pf-ink)]">Dashboard</span>
        </p>
        <div className="hidden items-center gap-2 sm:flex">
          <IconButton><CalendarGlyph className="h-4 w-4" /></IconButton>
          <IconButton><ShareGlyph className="h-4 w-4" /></IconButton>
        </div>
      </div>

      {/* Hero panel: title + gauge + KPI stats (no greeting) */}
      <section className="pf-rise relative overflow-hidden rounded-[20px] border border-[var(--pf-border)] bg-gradient-to-br from-[var(--pf-grad-warm-1)] to-[var(--pf-grad-warm-2)] p-5 sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[var(--pf-ink)] sm:text-[32px]">
              Platform overview
            </h1>
            <p className="mt-1.5 text-[14px] font-medium text-[var(--pf-muted)]">{dateStr}</p>
          </div>
          <Gauge value={liveRate} label="Live store rate" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-[var(--pf-border)] pt-5 lg:grid-cols-4">
          <Stat icon={<BoxesIcon className="h-4 w-4" />} value={fmt(total)} label="Total Stores" />
          <Stat icon={<CheckCircleIcon className="h-4 w-4" />} value={fmt(s.liveStores)} label="Live Stores" />
          <Stat icon={<ReceiptIcon className="h-4 w-4" />} value={money(s.mrr)} label="MRR" />
          <Stat icon={<UsersIcon className="h-4 w-4" />} value={fmt(s.signups30d)} label="Signups (30d)" />
        </div>
      </section>

      {/* Key business metrics */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric value={`${conversion}%`} label="Trial → Paid" hint="Conversion rate" accent />
        <Metric value={money(arpu)} label="ARPU" hint="Avg revenue / live store" />
        <Metric value={money(s.arr)} label="ARR" hint="Annual recurring revenue" />
        <Metric value={money(s.gmv30d)} label="GMV (30d)" hint={`${fmt(s.orders30d)} orders`} />
      </section>

      {/* Middle grid */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4"><ScheduleCard tenants={tenants.slice(0, 3)} /></div>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <KpiCard rate={conversion} series={s.signupSeries} />
          <LifecycleRow t={s.tenants} />
        </div>
        <div className="lg:col-span-3"><StatusCard s={s} /></div>
      </section>

      {/* Plan mix + recent stores */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5"><PlanMix rows={s.mrrByPlan} mrr={s.mrr} /></div>
        <div className="lg:col-span-7"><StoresTable rows={tenants.slice(0, 6)} /></div>
      </section>

      {/* Wholesale / B2B section */}
      <section className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5 text-[var(--pf-yellow-deep)]" />
            <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Wholesale (B2B)</h2>
          </div>
          <Link
            href="/platform/wholesale-kyc"
            className="text-[13px] font-semibold text-[var(--pf-yellow-deep)] hover:underline"
          >
            KYC Queue →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <WholesaleStat
            value={fmt(ws.totalWholesalers)}
            label="Total Wholesalers"
          />
          <WholesaleStat
            value={fmt(ws.pendingKyc)}
            label="Pending KYC"
            link="/platform/wholesale-kyc"
          />
          <WholesaleStat
            value={money(ws.wholesaleGmv30d)}
            label="Wholesale GMV (30d)"
          />
          <WholesaleStat
            value={fmt(ws.wholesaleOrders30d)}
            label="Wholesale Orders (30d)"
          />
          <WholesaleStat
            value={fmt(ws.wholesaleProductsCount)}
            label="Wholesale Products"
          />
        </div>
      </section>

      {/* Middle grid */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4"><ScheduleCard tenants={tenants.slice(0, 3)} /></div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <KpiCard rate={liveRate} series={s.signupSeries} />
          <LifecycleRow t={s.tenants} />
        </div>

        <div className="lg:col-span-3"><StatusCard s={s} /></div>
      </section>

      {/* Recent stores table */}
      <StoresTable rows={tenants.slice(0, 6)} />
    </div>
  );
}

/* ---------- formatting ---------- */
function fmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
function money(n: number): string {
  return `৳${new Intl.NumberFormat("en-US").format(Math.round(n))}`;
}

/* ---------- hero pieces ---------- */
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--pf-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[22px] font-bold leading-none text-[var(--pf-ink)]">{value}</span>
        <span className="mt-1 block text-[13px] font-medium text-[var(--pf-muted)]">{label}</span>
      </span>
    </div>
  );
}

function Metric({ value, label, hint, accent = false }: { value: string; label: string; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-[var(--pf-yellow)] bg-gradient-to-br from-[var(--pf-grad-gold-1)] to-[var(--pf-grad-gold-2)]" : "border-[var(--pf-border)] bg-[var(--pf-panel)]"}`}>
      <p className="text-[24px] font-bold leading-none text-[var(--pf-ink)]">{value}</p>
      <p className="mt-2 text-[13px] font-semibold text-[var(--pf-ink)]">{label}</p>
      <p className="mt-0.5 text-[12px] text-[var(--pf-muted)]">{hint}</p>
    </div>
  );
}

function WholesaleStat({ value, label, link }: { value: string; label: string; link?: string }) {
  const inner = (
    <div className="rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-panel)] p-3.5">
      <p className="text-[20px] font-bold leading-none text-[var(--pf-ink)]">{value}</p>
      <p className="mt-1 text-[12px] font-medium text-[var(--pf-muted)]">{label}</p>
    </div>
  );
  if (link) {
    return <Link href={link}>{inner}</Link>;
  }
  return inner;
}

function Gauge({ value, label }: { value: number; label: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const SPAN = 0.75;
  const track = C * SPAN;
  const prog = track * (Math.min(100, Math.max(0, value)) / 100);
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative h-[120px] w-[120px] sm:h-[128px] sm:w-[128px]">
        <svg viewBox="0 0 120 120" className="h-full w-full" style={{ transform: "rotate(135deg)" }}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--pf-gauge-track)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${track} ${C}`} />
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--pf-yellow)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${prog} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold leading-none text-[var(--pf-ink)]">{value}%</span>
        </div>
      </div>
      <span className="-mt-1 max-w-[128px] text-center text-[12px] font-medium text-[var(--pf-muted)]">{label}</span>
    </div>
  );
}

/* ---------- schedule / recent signups ---------- */
function ScheduleCard({ tenants }: { tenants: TenantDirectoryRow[] }) {
  return (
    <div className="pf-rise flex h-full flex-col rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Recent signups</h2>
        <Dots />
      </div>
      <div className="mt-3 flex gap-1.5">
        <Pill active>Latest</Pill>
        <Pill>Trials</Pill>
        <Pill>Active</Pill>
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {tenants.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--pf-muted)]">No stores yet.</p>
        ) : (
          tenants.map((t) => (
            <div key={t.id} className="rounded-2xl bg-[var(--pf-cream)] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-semibold leading-snug text-[var(--pf-ink)]">{t.name}</p>
                <Avatar name={t.name} />
              </div>
              <p className="mt-0.5 text-[12.5px] text-[var(--pf-muted)]">{t.planName ?? "No plan"} · {t.status}</p>
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[11.5px] font-medium text-[var(--pf-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pf-yellow)]" />
                {t.slug} · {shortDate(t.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
      <Link href="/platform/tenants" className="mt-auto pt-3 text-[13px] font-semibold text-[var(--pf-yellow-deep)] hover:underline">
        View all stores →
      </Link>
    </div>
  );
}

/* ---------- KPI line chart ---------- */
function KpiCard({ rate, series }: { rate: number; series: PlatformStats["signupSeries"] }) {
  const max = Math.max(1, ...series.map((d) => d.count));
  const n = Math.max(1, series.length - 1);
  const W = 320, H = 96;
  const pts = series.map((d, i) => {
    const x = (i / n) * W;
    const y = H - (d.count / max) * (H - 10) - 4;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <div className="pf-rise rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[26px] font-bold leading-none text-[var(--pf-ink)]">{rate}%</p>
          <p className="mt-1 text-[13px] font-medium text-[var(--pf-muted)]">Trial → Paid conversion</p>
        </div>
        <Link href="/platform/finance" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--pf-border)] text-[var(--pf-muted)] hover:bg-[var(--pf-hover)]">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-24 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pfArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pf-yellow)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--pf-yellow)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#pfArea)" />
        <path d={line} fill="none" stroke="var(--pf-yellow-deep)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-medium text-[var(--pf-subtle)]">
        <span>{series.length ? dayLabel(series[0]!.day) : ""}</span>
        <span>14-day signups</span>
        <span>{series.length ? dayLabel(series[series.length - 1]!.day) : ""}</span>
      </div>
    </div>
  );
}

/* ---------- lifecycle quick cards ---------- */
function LifecycleRow({ t }: { t: PlatformStats["tenants"] }) {
  const items = [
    { label: "Trial", value: t.trial },
    { label: "Active", value: t.active },
    { label: "Past due", value: t.pastDue },
    { label: "Suspended", value: t.suspended },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-panel)] p-3.5">
          <span className="block h-1.5 w-1.5 rounded-full bg-[var(--pf-yellow)]" />
          <p className="mt-2 text-[20px] font-bold leading-none text-[var(--pf-ink)]">{fmt(it.value)}</p>
          <p className="mt-1 text-[12px] font-medium text-[var(--pf-muted)]">{it.label}</p>
          <Link href="/platform/tenants" className="mt-1.5 inline-block text-[11px] font-semibold text-[var(--pf-yellow-deep)] hover:underline">
            View →
          </Link>
        </div>
      ))}
    </div>
  );
}

/* ---------- store status bars ---------- */
function StatusCard({ s }: { s: PlatformStats }) {
  const total = Math.max(1, s.tenants.total);
  const bars = [
    { label: "Active", value: s.tenants.active, cls: "bg-[var(--pf-yellow)]" },
    { label: "Trial", value: s.tenants.trial, cls: "bg-[var(--pf-black)]" },
    { label: "Suspended", value: s.tenants.suspended, cls: "bg-[var(--pf-bar-mute)]" },
  ];
  return (
    <div className="pf-rise flex h-full flex-col rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Store status</h2>
        <Dots />
      </div>
      <div className="mt-1">
        <p className="text-[26px] font-bold leading-none text-[var(--pf-ink)]">{fmt(s.liveStores)}</p>
        <p className="mt-1 text-[13px] font-medium text-[var(--pf-muted)]">Live stores</p>
      </div>
      <div className="mt-4 flex flex-1 items-center">
        <div className="flex w-full items-end justify-around gap-3">
          {bars.map((b) => {
            const pct = Math.round((b.value / total) * 100);
            return (
              <div key={b.label} className="flex w-full flex-col items-center gap-2">
                <span className="text-[13px] font-bold text-[var(--pf-ink)]">{pct}%</span>
                <div className="flex h-[140px] w-full items-end">
                  <div className={`w-full rounded-xl ${b.cls}`} style={{ height: `${Math.max(6, pct)}%` }} />
                </div>
                <span className="text-[11.5px] font-medium text-[var(--pf-muted)]">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- plan mix ---------- */
function PlanMix({ rows, mrr }: { rows: PlatformStats["mrrByPlan"]; mrr: number }) {
  const totalMrr = Math.max(1, mrr);
  return (
    <div className="pf-rise flex h-full flex-col rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
      <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Revenue by plan</h2>
      <p className="mt-0.5 text-[12.5px] text-[var(--pf-muted)]">MRR contribution across active plans.</p>
      {rows.length === 0 ? (
        <p className="flex-1 py-10 text-center text-[13px] text-[var(--pf-muted)]">No active subscriptions yet.</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {rows.map((p) => {
            const pct = Math.round((p.mrr / totalMrr) * 100);
            return (
              <li key={p.plan}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-[var(--pf-ink)]">{p.plan} <span className="font-normal text-[var(--pf-muted)]">· {fmt(p.tenants)} stores</span></span>
                  <span className="font-mono font-semibold text-[var(--pf-ink)]">{money(p.mrr)}</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--pf-track)]">
                  <div className="h-full rounded-full bg-[var(--pf-yellow)]" style={{ width: `${Math.max(3, pct)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- recent stores table ---------- */
function StoresTable({ rows }: { rows: TenantDirectoryRow[] }) {
  return (
    <div className="pf-rise h-full rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Recent stores</h2>
        <Link href="/platform/tenants" className="text-[13px] font-semibold text-[var(--pf-yellow-deep)] hover:underline">
          See all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
              <th className="pb-2 font-semibold">Store</th>
              <th className="pb-2 font-semibold">Plan</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--pf-border)]">
                <td className="py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={r.name} />
                    <span className="min-w-0">
                      <Link href={`/platform/tenants/${r.id}`} className="block font-semibold text-[var(--pf-ink)] hover:underline">{r.name}</Link>
                      <span className="block font-mono text-[11px] text-[var(--pf-subtle)]">{r.slug}</span>
                    </span>
                  </span>
                </td>
                <td className="py-3 text-[var(--pf-muted)]">{r.planName ?? "—"}</td>
                <td className="py-3"><StatusBadge status={r.status} /></td>
                <td className="py-3 text-[var(--pf-muted)]">{shortDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

/* ---------- shared atoms ---------- */
function Pill({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${active ? "bg-[var(--pf-black)] text-[var(--pf-on-black)]" : "bg-[var(--pf-hover)] text-[var(--pf-muted)]"}`}>
      {children}
    </span>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pf-yellow-soft)] text-[12px] font-bold text-[var(--pf-yellow-deep)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
function Dots() {
  return (
    <button type="button" className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--pf-subtle)] hover:bg-[var(--pf-hover)]" aria-label="More">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
    </button>
  );
}
function IconButton({ children }: { children: React.ReactNode }) {
  return <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--pf-border)] bg-[var(--pf-panel)] text-[var(--pf-muted)] hover:bg-[var(--pf-hover)]">{children}</button>;
}
function CalendarGlyph({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>;
}
function ShareGlyph({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>;
}
function ArrowUpRight({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>;
}

/* ---------- date helpers ---------- */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: DHAKA }).format(new Date(iso));
}
function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: DHAKA }).format(new Date(iso + "T00:00:00+06:00"));
}
