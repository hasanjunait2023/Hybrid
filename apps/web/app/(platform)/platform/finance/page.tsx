import { getFinanceOverview, listExpenses, type FinanceRange } from "@/lib/platform/finance";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { ExpenseForm, DeleteExpense } from "./ExpenseControls";

// Platform finance / P&L (PP1-B2). Revenue (paid invoices) − expenses, by
// category, plus receivables. Range presets. "Homies-Lab" console skin. Authz
// via layout; writes gated to super-admin/accountant in the actions.
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
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Finance</span>
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">{tx.title}</h1>
          <p className="mt-1 font-mono text-[12px] text-[var(--pf-muted)]">{range.from} — {range.to}</p>
        </div>
        <div className="flex gap-1.5">
          {[{ r: "7", label: tx.range7 }, { r: "30", label: tx.range30 }, { r: "90", label: tx.range90 }].map((p) => (
            <a
              key={p.r}
              href={`/platform/finance?r=${p.r}`}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${preset === p.r ? "bg-[var(--pf-black)] text-[#f6f3ea]" : "border border-[var(--pf-border)] bg-[var(--pf-panel)] text-[var(--pf-muted)] hover:bg-[#fbf9f2]"}`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tx.revenue} value={formatMoney(ov.revenue, locale)} tone="success" />
        <Stat label={tx.expenses} value={formatMoney(ov.expenses, locale)} tone="danger" />
        <Stat label={tx.netProfit} value={formatMoney(ov.netProfit, locale)} tone={profit ? "success" : "danger"} accent />
        <Stat label={tx.receivablesOverdue} value={formatMoney(ov.receivablesOverdue, locale)} sub={`${tx.receivablesOpen} ${formatMoney(ov.receivablesOpen, locale)}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ExpenseForm />
          <div className="overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)]">
            <h2 className="border-b border-[var(--pf-border)] px-4 py-3 text-[14px] font-bold text-[var(--pf-ink)]">{tx.expenseList}</h2>
            {expenses.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[var(--pf-muted)]">{tx.noExpenses}</p>
            ) : (
              <ul className="divide-y divide-[var(--pf-border)]">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="rounded-full bg-[#fbf9f2] px-2 py-0.5 text-[11px] font-semibold text-[var(--pf-muted)]">{e.category}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--pf-ink)]">{e.vendor ?? e.note ?? "—"}</span>
                    <span className="font-mono text-[12px] text-[var(--pf-subtle)]">{e.incurredOn}</span>
                    <span className="font-mono text-[13px] font-semibold text-[var(--pf-danger)]">{formatMoney(e.amount, locale)}</span>
                    <DeleteExpense id={e.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4">
          <h2 className="mb-3 text-[14px] font-bold text-[var(--pf-ink)]">{tx.expenseByCategory}</h2>
          {ov.expenseByCategory.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--pf-muted)]">{tx.noData}</p>
          ) : (
            <ul className="space-y-2.5">
              {ov.expenseByCategory.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 text-[var(--pf-ink)]">
                    <span className="h-2 w-2 rounded-[3px] bg-[var(--pf-yellow)]" />
                    {c.category}
                  </span>
                  <span className="font-mono font-semibold text-[var(--pf-ink)]">{formatMoney(c.amount, locale)}</span>
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
  const c = tone === "success" ? "text-[var(--pf-success)]" : tone === "danger" ? "text-[var(--pf-danger)]" : "text-[var(--pf-ink)]";
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-[var(--pf-yellow)] bg-gradient-to-br from-[#fdf4d4] to-[#fbe6a8]" : "border-[var(--pf-border)] bg-[var(--pf-panel)]"}`}>
      <p className="text-[12px] text-[var(--pf-muted)]">{label}</p>
      <p className={`mt-1.5 text-[22px] font-bold leading-none ${accent ? "text-[var(--pf-ink)]" : c}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-[var(--pf-subtle)]">{sub}</p>}
    </div>
  );
}
