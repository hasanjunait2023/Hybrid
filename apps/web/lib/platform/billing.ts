// Platform billing & subscriptions (tenant roadmap PP1-A3). Wires the existing
// billing engine (lib/billing) to a super-admin view: revenue overview,
// subscription roster, invoices, and manual overrides (extend trial, mark paid).
// asPlatformAdmin — Hybrid's own billing ops, not tenant-scoped.
import { asPlatformAdmin } from "@hybrid/db";

export interface BillingOverview {
  mrr: number;
  trialing: number;
  active: number;
  pastDue: number;
  openInvoiceAmount: number;
  overdueAmount: number;
}

export async function getBillingOverview(): Promise<BillingOverview> {
  return asPlatformAdmin(async (tx) => {
    const subs = await tx<{ status: string; n: number; mrr: string }[]>`
      select s.status::text as status, count(*)::int as n,
        coalesce(sum(case when p.billing_interval = 'yearly' then p.price_bdt / 12 else p.price_bdt end), 0) as mrr
      from subscription s join plan p on p.id = s.plan_id
      group by s.status
    `;
    const row = (st: string) => subs.find((r) => r.status === st);
    const inv = await tx<{ open: string; overdue: string }[]>`
      select
        coalesce(sum(amount) filter (where status = 'open'), 0) as open,
        coalesce(sum(amount) filter (where status = 'overdue'
          or (status = 'open' and due_at is not null and due_at < now())), 0) as overdue
      from invoice
    `;
    return {
      mrr: Number(row("active")?.mrr ?? 0),
      trialing: row("trialing")?.n ?? 0,
      active: row("active")?.n ?? 0,
      pastDue: row("past_due")?.n ?? 0,
      openInvoiceAmount: Number(inv[0]?.open ?? 0),
      overdueAmount: Number(inv[0]?.overdue ?? 0),
    };
  });
}

export interface SubscriptionRow {
  tenantId: string;
  tenantName: string;
  plan: string | null;
  status: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  mrr: number;
}

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        tenant_id: string;
        tenant_name: string;
        plan: string | null;
        status: string;
        period_end: string | null;
        cancel: boolean;
        price: string | null;
        interval: string | null;
      }[]
    >`
      select s.tenant_id, t.name as tenant_name, p.name as plan, s.status::text as status,
        s.current_period_end as period_end, s.cancel_at_period_end as cancel,
        p.price_bdt as price, p.billing_interval as interval
      from subscription s
      join tenant t on t.id = s.tenant_id
      left join plan p on p.id = s.plan_id
      order by s.current_period_end asc nulls last
    `,
  );
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    plan: r.plan,
    status: r.status,
    periodEnd: r.period_end,
    cancelAtPeriodEnd: r.cancel,
    mrr: r.status === "active" ? (r.interval === "yearly" ? Number(r.price ?? 0) / 12 : Number(r.price ?? 0)) : 0,
  }));
}

export interface InvoiceRow {
  id: string;
  tenantName: string;
  amount: number;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
}

export async function listInvoices(status?: string): Promise<InvoiceRow[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string; tenant_name: string; amount: string; status: string; due_at: string | null; paid_at: string | null }[]>`
      select i.id, t.name as tenant_name, i.amount, i.status::text as status, i.due_at, i.paid_at
      from invoice i join tenant t on t.id = i.tenant_id
      where (${status ?? null}::text is null or i.status::text = ${status ?? null})
      order by i.created_at desc limit 200
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    tenantName: r.tenant_name,
    amount: Number(r.amount),
    status: r.status,
    dueAt: r.due_at,
    paidAt: r.paid_at,
  }));
}

// Extend a tenant's trial/cycle by N days and un-suspend if needed. Pushes the
// subscription period end forward, returns it to 'trialing', and reactivates the
// tenant if it was past_due/suspended. Manual goodwill override.
export async function extendTrial(tenantId: string, days: number): Promise<void> {
  const d = Math.max(1, Math.min(365, Math.trunc(days)));
  await asPlatformAdmin(async (tx) => {
    await tx`
      update subscription
         set current_period_end = greatest(coalesce(current_period_end, now()), now()) + (${d} || ' days')::interval,
             status = 'trialing'
       where tenant_id = ${tenantId}
    `;
    await tx`
      update tenant set status = 'trial', updated_at = now()
       where id = ${tenantId} and status in ('past_due', 'suspended')
    `;
  });
}

export async function markInvoicePaid(invoiceId: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`update invoice set status = 'paid', paid_at = now(), updated_at = now() where id = ${invoiceId}`;
  });
}
