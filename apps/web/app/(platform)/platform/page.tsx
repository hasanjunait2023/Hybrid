import Link from "next/link";
import { asPlatformAdmin } from "@hybrid/db";
import { getPlatformStats, type PlatformStats } from "@/lib/platform/analytics";
import { listTenants, type TenantDirectoryRow } from "@/lib/platform/data";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { BoxesIcon, CheckCircleIcon, ReceiptIcon, UsersIcon } from "@hybrid/ui";

// Platform owner dashboard — "Homies-Lab" console skin (operator-facing, Latin
// numerals, English). Hybrid's own business across every tenant: store counts,
// MRR/ARR, GMV, signups, lifecycle mix. Authz via the layout (getPlatformAdmin).
export const dynamic = "force-dynamic";

const DHAKA = "Asia/Dhaka";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

async function adminFirstName(): Promise<string> {
  const admin = await getPlatformAdmin();
  if (!admin) return "Admin";
  const rows = await asPlatformAdmin((tx) =>
    tx<{ full_name: string | null; email: string | null }[]>`
      select full_name, email from app_user where id = ${admin.userId} limit 1
    `,
  );
  const r = rows[0];
  return (r?.full_name?.trim().split(" ")[0]) || r?.email?.split("@")[0] || "Admin";
}

export default async function PlatformDashboard() {
  const [s, tenants, name] = await Promise.all([
    getPlatformStats(),
    listTenants(),
    adminFirstName(),
  ]);

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: DHAKA,
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: DHAKA }).format(now),
  );
  const liveRate = s.tenants.total > 0 ? Math.round((s.liveStores / s.tenants.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[var(--pf-muted)]">
          Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
          <span className="text-[var(--pf-ink)]">Dashboard</span>
        </p>
        <div className="flex items-center gap-2">
          <IconButton><CalendarGlyph className="h-4 w-4" /></IconButton>
          <IconButton><ShareGlyph className="h-4 w-4" /></IconButton>
        </div>
      </div>

      {/* Hero panel: greeting + gauge + KPI stats */}
      <section className="pf-rise relative overflow-hidden rounded-[22px] border border-[var(--pf-border)] bg-gradient-to-br from-[#fdf8ec] to-[#fbf3dc] p-6 lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[var(--pf-ink)] lg:text-[34px]">
              {greetingFor(hour)}, {name}
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--pf-muted)]">It&rsquo;s {dateStr}</p>
          </div>
          <Gauge value={liveRate} label="Live store rate" />
        </div>

        <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-[var(--pf-border)]/70 pt-5 sm:grid-cols-4">
          <Stat icon={<BoxesIcon className="h-4 w-4" />} value={fmt(s.tenants.total)} label="Total Stores" />
          <Stat icon={<CheckCircleIcon className="h-4 w-4" />} value={fmt(s.liveStores)} label="Live Stores" />
          <Stat icon={<ReceiptIcon className="h-4 w-4" />} value={money(s.mrr)} label="MRR" />
          <Stat icon={<UsersIcon className="h-4 w-4" />} value={fmt(s.signups30d)} label="Signups (30d)" />
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--pf-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[22px] font-bold leading-none text-[var(--pf-ink)]">{value}</span>
        <span className="mt-1 block text-[12px] text-[var(--pf-muted)]">{label}</span>
      </span>
    </div>
  );
}

function Gauge({ value, label }: { value: number; label: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const SPAN = 0.75; // 270° arc, gap at the bottom
  const track = C * SPAN;
  const prog = track * (Math.min(100, Math.max(0, value)) / 100);
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative h-[128px] w-[128px]">
        <svg viewBox="0 0 120 120" className="h-full w-full" style={{ transform: "rotate(135deg)" }}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="#efe9da" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${track} ${C}`} />
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--pf-yellow)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${prog} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold leading-none text-[var(--pf-ink)]">{value}%</span>
        </div>
      </div>
      <span className="-mt-1 max-w-[128px] text-center text-[11px] leading-tight text-[var(--pf-muted)]">{label}</span>
    </div>
  );
}

/* ---------- schedule / recent signups ---------- */
function ScheduleCard({ tenants }: { tenants: TenantDirectoryRow[] }) {
  return (
    <div className="pf-rise flex h-full flex-col rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-[var(--pf-ink)]">Recent signups</h2>
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
                <p className="text-[13.5px] font-semibold leading-snug text-[var(--pf-ink)]">{t.name}</p>
                <Avatar name={t.name} />
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--pf-muted)]">{t.planName ?? "No plan"} · {t.status}</p>
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-[var(--pf-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pf-yellow)]" />
                {t.slug}.hybrid · {shortDate(t.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
      <Link href="/platform/tenants" className="mt-auto pt-3 text-[12px] font-semibold text-[var(--pf-yellow-deep)] hover:underline">
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
          <p className="mt-1 text-[12px] text-[var(--pf-muted)]">Active store rate</p>
        </div>
        <Link href="/platform/finance" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--pf-border)] text-[var(--pf-muted)] hover:bg-[#fbf9f2]">
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
      <div className="mt-1 flex justify-between text-[10px] text-[var(--pf-subtle)]">
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
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--pf-yellow)]" />
          <p className="mt-2 text-[20px] font-bold leading-none text-[var(--pf-ink)]">{fmt(it.value)}</p>
          <p className="mt-1 text-[11px] text-[var(--pf-muted)]">{it.label}</p>
          <Link href="/platform/tenants" className="mt-1.5 inline-block text-[10.5px] font-medium text-[var(--pf-yellow-deep)] hover:underline">
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
    { label: "Suspended", value: s.tenants.suspended, cls: "bg-[#d8d2c2]" },
  ];
  return (
    <div className="pf-rise flex h-full flex-col rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-[var(--pf-ink)]">Store status</h2>
        <Dots />
      </div>
      <div className="mt-1">
        <p className="text-[26px] font-bold leading-none text-[var(--pf-ink)]">{fmt(s.liveStores)}</p>
        <p className="mt-1 text-[12px] text-[var(--pf-muted)]">Live stores</p>
      </div>
      <div className="mt-4 flex flex-1 items-center">
        <div className="flex w-full items-end justify-around gap-3">
          {bars.map((b) => {
            const pct = Math.round((b.value / total) * 100);
            return (
              <div key={b.label} className="flex w-full flex-col items-center gap-2">
                <span className="text-[12px] font-bold text-[var(--pf-ink)]">{pct}%</span>
                <div className="flex h-[150px] w-full items-end">
                  <div className={`w-full rounded-xl ${b.cls}`} style={{ height: `${Math.max(6, pct)}%` }} />
                </div>
                <span className="text-[10.5px] text-[var(--pf-muted)]">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- recent stores table ---------- */
function StoresTable({ rows }: { rows: TenantDirectoryRow[] }) {
  return (
    <div className="pf-rise rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Recent stores</h2>
        <Link href="/platform/tenants" className="text-[12px] font-semibold text-[var(--pf-yellow-deep)] hover:underline">
          See all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
              <th className="pb-2 font-semibold">Store</th>
              <th className="pb-2 font-semibold">Tenant ID</th>
              <th className="pb-2 font-semibold">Plan</th>
              <th className="pb-2 font-semibold">Owner</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2 font-semibold">Created</th>
              <th className="pb-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--pf-border)]">
                <td className="py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={r.name} />
                    <span className="font-semibold text-[var(--pf-ink)]">{r.name}</span>
                  </span>
                </td>
                <td className="py-3 font-mono text-[12px] text-[var(--pf-muted)]">{r.slug}</td>
                <td className="py-3 text-[var(--pf-muted)]">{r.planName ?? "—"}</td>
                <td className="py-3 text-[var(--pf-muted)]">{r.ownerEmail ?? "—"}</td>
                <td className="py-3"><StatusBadge status={r.status} /></td>
                <td className="py-3 text-[var(--pf-muted)]">{shortDate(r.createdAt)}</td>
                <td className="py-3 text-right"><Dots /></td>
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

/* ---------- shared atoms ---------- */
function Pill({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${active ? "bg-[var(--pf-black)] text-[#f6f3ea]" : "bg-[#fbf9f2] text-[var(--pf-muted)]"}`}>
      {children}
    </span>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--pf-yellow-soft)] text-[11px] font-bold text-[var(--pf-yellow-deep)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
function Dots() {
  return (
    <button type="button" className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--pf-subtle)] hover:bg-[#fbf9f2]" aria-label="More">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
    </button>
  );
}
function IconButton({ children }: { children: React.ReactNode }) {
  return <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--pf-border)] bg-[var(--pf-panel)] text-[var(--pf-muted)] hover:bg-[#fbf9f2]">{children}</button>;
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
