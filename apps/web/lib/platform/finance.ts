// Platform accounting & finance (tenant roadmap PP1-B2). Hybrid's own P&L:
// revenue from paid invoices (already in DB) minus expenses (platform_expense).
// Platform tables, is_platform_admin-guarded — all via asPlatformAdmin. Money as
// numbers. Ranges are Dhaka-local 'YYYY-MM-DD'.
import { asPlatformAdmin } from "@hybrid/db";

export interface FinanceRange {
  from: string;
  to: string;
}

export interface FinanceOverview {
  revenue: number; // paid invoices in range
  expenses: number; // platform expenses in range
  netProfit: number;
  expenseByCategory: { category: string; amount: number }[];
  receivablesOpen: number; // unpaid invoice amount (all-time)
  receivablesOverdue: number;
}

export async function getFinanceOverview(range: FinanceRange): Promise<FinanceOverview> {
  return asPlatformAdmin(async (tx) => {
    const rev = await tx<{ revenue: string }[]>`
      select coalesce(sum(amount), 0) as revenue from invoice
      where status = 'paid'
        and (paid_at at time zone 'Asia/Dhaka')::date between ${range.from}::date and ${range.to}::date
    `;
    const exp = await tx<{ category: string; amount: string }[]>`
      select category, coalesce(sum(amount), 0) as amount from platform_expense
      where incurred_on between ${range.from}::date and ${range.to}::date
      group by category order by sum(amount) desc
    `;
    const recv = await tx<{ open: string; overdue: string }[]>`
      select
        coalesce(sum(amount) filter (where status in ('open', 'overdue')), 0) as open,
        coalesce(sum(amount) filter (where status = 'overdue'
          or (status = 'open' and due_at is not null and due_at < now())), 0) as overdue
      from invoice
    `;
    const revenue = Number(rev[0]?.revenue ?? 0);
    const byCat = exp.map((e) => ({ category: e.category, amount: Number(e.amount) }));
    const expenses = byCat.reduce((s, e) => s + e.amount, 0);
    return {
      revenue,
      expenses,
      netProfit: revenue - expenses,
      expenseByCategory: byCat,
      receivablesOpen: Number(recv[0]?.open ?? 0),
      receivablesOverdue: Number(recv[0]?.overdue ?? 0),
    };
  });
}

export interface Expense {
  id: string;
  category: string;
  vendor: string | null;
  amount: number;
  note: string | null;
  incurredOn: string;
}

export async function listExpenses(range: FinanceRange): Promise<Expense[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string; category: string; vendor: string | null; amount: string; note: string | null; incurred_on: string }[]>`
      select id, category, vendor, amount, note, incurred_on::text as incurred_on
      from platform_expense
      where incurred_on between ${range.from}::date and ${range.to}::date
      order by incurred_on desc, created_at desc limit 500
    `,
  );
  return rows.map((r) => ({
    id: r.id, category: r.category, vendor: r.vendor, amount: Number(r.amount), note: r.note, incurredOn: r.incurred_on,
  }));
}

export interface AddExpenseInput {
  category: string;
  vendor?: string;
  amount: number;
  note?: string;
  incurredOn?: string;
  createdBy?: string;
}

export async function addExpense(input: AddExpenseInput): Promise<{ id: string }> {
  if (!(input.amount >= 0)) throw new Error("AMOUNT_INVALID");
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`
      insert into platform_expense (category, vendor, amount, note, incurred_on, created_by)
      values (${input.category}, ${input.vendor ?? null}, ${input.amount}, ${input.note ?? null},
              coalesce(${input.incurredOn ?? null}::date, current_date), ${input.createdBy ?? null})
      returning id
    `,
  );
  return { id: rows[0]!.id };
}

export async function deleteExpense(id: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`delete from platform_expense where id = ${id}`;
  });
}
