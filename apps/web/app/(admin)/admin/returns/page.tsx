import { redirect } from "next/navigation";
import { formatBdtLatin } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  listReturns,
  getReturnStats,
  type ReturnStatus,
  type ReturnType,
} from "@/lib/admin/returns";
import { timeAgoBn } from "@/lib/admin/format";
import { PageHeader, StatStrip, StatCard } from "../_ui";
import { ReturnStatusChip, ReturnTypeChip } from "./ReturnStatusChip";

// Returns / RTO / Exchange list (echoes products/orders list pages). Status +
// type filter pills reading searchParams, StatStrip with open / RTO queue /
// month refund. Stacked cards on mobile, table ≥ md. Latin numerals (§4.4).
interface ReturnsPageProps {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>;
}

const STATUS_PILLS: { value: string; bn: string }[] = [
  { value: "all", bn: "সব" },
  { value: "requested", bn: "অনুরোধ" },
  { value: "approved", bn: "অনুমোদিত" },
  { value: "in_transit", bn: "পথে" },
  { value: "received", bn: "গৃহীত" },
  { value: "refunded", bn: "রিফান্ডেড" },
  { value: "completed", bn: "সম্পন্ন" },
  { value: "rejected", bn: "প্রত্যাখ্যাত" },
  { value: "cancelled", bn: "বাতিল" },
];

const REASON_BN: Record<string, string> = {
  wrong_item: "ভুল পণ্য",
  damaged: "ক্ষতিগ্রস্ত",
  size_issue: "সাইজ সমস্যা",
  not_as_described: "বর্ণনা মেলেনি",
  customer_refused: "গ্রাহক প্রত্যাখ্যান",
  rto_undelivered: "ডেলিভারি ব্যর্থ",
  fake_order: "ভুয়া অর্ডার",
  other: "অন্যান্য",
};

const STATUS_VALUES: ReturnStatus[] = [
  "requested",
  "approved",
  "rejected",
  "in_transit",
  "received",
  "refunded",
  "completed",
  "cancelled",
];

export default async function AdminReturnsPage({ searchParams }: ReturnsPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const rawStatus = sp.status;
  const status =
    rawStatus && STATUS_VALUES.includes(rawStatus as ReturnStatus)
      ? (rawStatus as ReturnStatus)
      : undefined;
  const type = sp.type === "rto" ? ("rto" as ReturnType) : undefined;
  const query = sp.q?.trim() || undefined;

  const [rows, stats] = await Promise.all([
    listReturns(tenantId, session.userId, { status, type, query }),
    getReturnStats(tenantId, session.userId),
  ]);

  const buildHref = (next: { status?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (next.type === "rto") params.set("type", "rto");
    else if (next.status && next.status !== "all") params.set("status", next.status);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/admin/returns?${qs}` : "/admin/returns";
  };

  const activeKey = type === "rto" ? "rto" : (status ?? "all");

  return (
    <div lang="en" className="space-y-4">
      <PageHeader
        title="রিটার্ন / RTO"
        subtitle={`${stats.open} খোলা · ${stats.rtoQueue} RTO`}
      />

      <StatStrip>
        <StatCard label="খোলা রিটার্ন" value={String(stats.open)} tone="pending" />
        <a href="/admin/returns?type=rto" className="contents">
          <StatCard
            label="RTO কিউ"
            value={String(stats.rtoQueue)}
            tone={stats.rtoQueue > 0 ? "warning" : "muted"}
            tappable
          />
        </a>
        <StatCard
          label="এই মাসে রিফান্ড"
          value={String(stats.refundedThisMonth)}
          tone="success"
        />
        <StatCard
          label="রিফান্ড টাকা"
          value={formatBdtLatin(stats.refundAmountThisMonth)}
          mono
        />
      </StatStrip>

      {/* Filter pills (status + RTO type), horizontal-scroll */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_PILLS.map((pill) => {
          const active = activeKey === pill.value;
          return (
            <a
              key={pill.value}
              href={buildHref({ status: pill.value })}
              className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                active
                  ? "bg-primary text-ink-on-primary"
                  : "border border-border bg-surface text-ink-muted hover:bg-surface-2"
              }`}
            >
              {pill.bn}
            </a>
          );
        })}
        <a
          href={buildHref({ type: "rto" })}
          className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
            activeKey === "rto"
              ? "bg-warning text-white"
              : "border border-border bg-surface text-warning hover:bg-surface-2"
          }`}
        >
          RTO
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          কোনো রিটার্ন নেই।
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <a
                  href={`/admin/returns/${r.id}`}
                  className="block rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-sm font-bold text-ink tnum">
                      #{r.orderNumber}
                    </span>
                    <span className="text-2xs text-ink-subtle">{timeAgoBn(r.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {r.customerName ?? "—"}
                      </p>
                      {r.customerPhone && (
                        <p className="font-mono text-xs text-ink-muted tnum">{r.customerPhone}</p>
                      )}
                    </div>
                    <span className="font-mono text-base font-bold text-ink tnum">
                      {formatBdtLatin(r.refundAmount)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ReturnTypeChip type={r.type} />
                    <ReturnStatusChip status={r.status} />
                    <span className="text-2xs text-ink-subtle">
                      {REASON_BN[r.reason] ?? r.reason} · {r.itemCount} পণ্য
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2.5 font-semibold">Order#</th>
                  <th className="px-3 py-2.5 font-semibold">গ্রাহক</th>
                  <th className="px-3 py-2.5 font-semibold">ধরন</th>
                  <th className="px-3 py-2.5 font-semibold">কারণ</th>
                  <th className="px-3 py-2.5 text-right font-semibold">পণ্য</th>
                  <th className="px-3 py-2.5 text-right font-semibold">রিফান্ড</th>
                  <th className="px-3 py-2.5 font-semibold">স্ট্যাটাস</th>
                  <th className="px-3 py-2.5 font-semibold">তারিখ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-3 py-2.5">
                      <a
                        href={`/admin/returns/${r.id}`}
                        className="font-mono font-semibold text-ink hover:text-primary hover:underline tnum"
                      >
                        #{r.orderNumber}
                      </a>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-ink">{r.customerName ?? "—"}</div>
                      {r.customerPhone && (
                        <div className="font-mono text-xs text-ink-muted tnum">
                          {r.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ReturnTypeChip type={r.type} />
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {REASON_BN[r.reason] ?? r.reason}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-muted tnum">
                      {r.itemCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {formatBdtLatin(r.refundAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <ReturnStatusChip status={r.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{timeAgoBn(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
