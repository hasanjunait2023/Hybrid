import {
  listWholesalerFees,
  getFeeSummary,
  currentPeriod,
  monthStart,
} from "@/lib/platform/marketplaceFee";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { GenerateButton, FeeEditor, StatusButtons } from "./FeeControls";

// Wholesale marketplace monthly fee (commission model = flat monthly fee).
// Configure each wholesaler's fee, generate the month's billed lines, and track
// paid/waived. Authz via the platform layout; writes gated in the actions.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ p?: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "বাকি",
  paid: "পরিশোধিত",
  waived: "মওকুফ",
};

function normPeriod(p?: string): string {
  if (p && /^\d{4}-\d{2}$/.test(p)) return monthStart(p);
  return currentPeriod();
}

export default async function MarketplaceFeesPage({ searchParams }: PageProps) {
  const { p } = await searchParams;
  const period = normPeriod(p);
  const periodYm = period.slice(0, 7);

  const [rows, summary] = await Promise.all([
    listWholesalerFees(period),
    getFeeSummary(period),
  ]);

  const { locale } = await getDict();
  const money = (n: number) => formatMoney(n, locale);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Marketplace Fees</span>
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--pf-ink)]">
            পাইকারি মার্কেটপ্লেস মাসিক ফি
          </h1>
          <p className="text-[13px] text-[var(--pf-muted)]">
            প্রতি wholesaler-এর জন্য নির্ধারিত মাসিক ফি — {periodYm}
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase text-[var(--pf-subtle)]">মাস</span>
            <input
              type="month"
              name="p"
              defaultValue={periodYm}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="h-9 rounded-md border border-border-strong px-3 text-sm font-medium text-ink-muted hover:text-primary"
          >
            দেখুন
          </button>
        </form>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="মোট বিল" value={money(summary.billed)} />
        <SummaryCard label="আদায়" value={money(summary.collected)} tone="success" />
        <SummaryCard label="বাকি" value={money(summary.pending)} tone="warn" />
        <SummaryCard label="Wholesaler সংখ্যা" value={String(summary.wholesalerCount)} />
      </div>

      <GenerateButton period={periodYm} />

      {/* Wholesaler table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2 font-semibold">Wholesaler</th>
              <th className="px-3 py-2 font-semibold">মাসিক ফি</th>
              <th className="px-3 py-2 font-semibold">এই মাসের বিল</th>
              <th className="px-3 py-2 font-semibold">অবস্থা</th>
              <th className="px-3 py-2 font-semibold">পদক্ষেপ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-ink-muted">
                  কোনো wholesaler নেই।
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.tenantId} className="border-b border-border">
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="font-mono text-xs text-ink-muted">{r.slug}</p>
                  </td>
                  <td className="px-3 py-2">
                    <FeeEditor tenantId={r.tenantId} current={r.monthlyFee} />
                  </td>
                  <td className="px-3 py-2 font-mono tnum">
                    {r.billedAmount == null ? "—" : money(r.billedAmount)}
                  </td>
                  <td className="px-3 py-2">
                    {r.status ? (
                      <span
                        className={
                          r.status === "paid"
                            ? "text-success"
                            : r.status === "waived"
                              ? "text-ink-muted"
                              : "text-warning"
                        }
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.feeId ? (
                      <StatusButtons feeId={r.feeId} status={r.status ?? "pending"} />
                    ) : (
                      <span className="text-2xs text-ink-muted">ফি তৈরি হয়নি</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warn";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "warn" ? "text-warning" : "text-[var(--pf-ink)]";
  return (
    <div className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-panel)] p-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-[var(--pf-subtle)]">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold tnum ${color}`}>{value}</p>
    </div>
  );
}
