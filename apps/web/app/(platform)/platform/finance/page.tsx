import { getFinanceOverview, listExpenses, type FinanceRange } from "@/lib/platform/finance";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { ExpenseForm, DeleteExpense } from "./ExpenseControls";

// Platform finance / P&L (PP1-B2). Revenue (paid invoices) − expenses, by
// category, plus receivables. Range presets. Authz via layout; writes gated to
// super-admin/accountant in the actions.
export const dynamic = "force-dynamic";

interface FinancePageProps {
  searchParams: Promise<{ r?: string }>;
}

function todayDhaka(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

function rangeFor(r?: string): { range: FinanceRange; preset: string } {
  const today = todayDhaka();
  const days = r === "7" ? 7 : r === "90" ? 90 : 30;
  const end = new Date(today + "T00:00:00+06:00");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { range: { from: start.toISOString().slice(0, 10), to: today }, preset: String(days) };
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const { r } = await searchParams;
  const { range, preset } = rangeFor(r);
  const [ov, expenses] = await Promise.all([getFinanceOverview(range), listExpenses(range)]);
  const profit = ov.netProfit >= 0;

  const { locale, d } = await getDict();
  const tx = d.platform.finance;

  return (
    <div className="space-y-5">
      <div>
        <a href="/platform" className="text-sm font-medium text-ink-muted hover:text-primary">{d.platform.common.backToDashboard}</a>
        <h1 className="mt-1 text-xl font-bold text-ink">{tx.title}</h1>
        <p className="text-2xs text-ink-subtle">{range.from} — {range.to}</p>
      </div>

      <div className="flex gap-2">
        {[{ r: "7", label: tx.range7 }, { r: "30", label: tx.range30 }, { r: "90", label: tx.range90 }].map((p) => (
          <a key={p.r} href={`/platform/finance?r=${p.r}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${preset === p.r ? "bg-primary text-ink-on-primary" : "border border-border bg-surface text-ink-muted hover:bg-surface-2"}`}>
            {p.label}
          </a>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tx.revenue} value={formatMoney(ov.revenue, locale)} tone="success" />
        <Stat label={tx.expenses} value={formatMoney(ov.expenses, locale)} tone="danger" />
        <Stat label={tx.netProfit} value={formatMoney(ov.netProfit, locale)} tone={profit ? "success" : "danger"} accent />
        <Stat label={tx.receivablesOverdue} value={formatMoney(ov.receivablesOverdue, locale)} sub={`${tx.receivablesOpen} ${formatMoney(ov.receivablesOpen, locale)}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Expense entry + list */}
        <div className="space-y-4 lg:col-span-2">
          <ExpenseForm />
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">{tx.expenseList}</h2>
            {expenses.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">{tx.noExpenses}</p>
            ) : (
              <ul className="divide-y divide-border">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">{e.category}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{e.vendor ?? e.note ?? "—"}</span>
                    <span className="font-mono text-xs text-ink-subtle tnum">{e.incurredOn}</span>
                    <span className="font-mono text-sm font-semibold text-danger tnum">{formatMoney(e.amount, locale)}</span>
                    <DeleteExpense id={e.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Expense by category */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 className="mb-3 text-sm font-bold text-ink">{tx.expenseByCategory}</h2>
          {ov.expenseByCategory.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">{tx.noData}</p>
          ) : (
            <ul className="space-y-2">
              {ov.expenseByCategory.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink">{c.category}</span>
                  <span className="font-mono font-semibold text-ink tnum">{formatMoney(c.amount, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone, accent = false }: { label: string; value: string; sub?: string; tone?: "success" | "danger"; accent?: boolean }) {
  const c = accent ? (tone === "danger" ? "text-danger" : "text-primary") : tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className={`rounded-lg border p-4 shadow-xs ${accent ? "border-primary bg-primary-weak" : "border-border bg-surface"}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none tnum ${c}`}>{value}</p>
      {sub && <p className="mt-1.5 text-2xs text-ink-subtle">{sub}</p>}
    </div>
  );
}
