// Platform analytics (tenant roadmap PP1-A1). Cross-tenant aggregates for the
// super-admin dashboard — runs as asPlatformAdmin (BYPASSRLS), so queries span
// every tenant. This is Hybrid's own business view (MRR, GMV, growth), NOT a
// tenant-scoped read. Money as numbers (numeric → string → Number).
import { asPlatformAdmin } from "@hybrid/db";

export interface PlatformStats {
  tenants: {
    total: number;
    trial: number;
    active: number;
    pastDue: number;
    suspended: number;
    cancelled: number;
  };
  /** Monthly recurring revenue (BDT) from active subscriptions, yearly /12. */
  mrr: number;
  arr: number;
  /** Gross merchandise value across all tenants, last 30 Dhaka-days. */
  gmv30d: number;
  orders30d: number;
  signups30d: number;
  /** Live stores = active or trial (can transact). */
  liveStores: number;
  /** 14-day signups series for the growth chart, oldest→newest. */
  signupSeries: { day: string; count: number }[];
  /** MRR contribution per plan. */
  mrrByPlan: { plan: string; tenants: number; mrr: number }[];
}

export async function getPlatformStats(): Promise<PlatformStats> {
  return asPlatformAdmin(async (tx) => {
    const byStatus = await tx<{ status: string; n: number }[]>`
      select status::text as status, count(*)::int as n from tenant group by status
    `;
    const get = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;

    const mrrRows = await tx<{ mrr: string }[]>`
      select coalesce(sum(
        case when p.billing_interval = 'yearly' then p.price_bdt / 12 else p.price_bdt end
      ), 0) as mrr
      from subscription s
      join plan p on p.id = s.plan_id
      where s.status = 'active'
    `;
    const mrr = Number(mrrRows[0]?.mrr ?? 0);

    const gmv = await tx<{ gmv: string; orders: number }[]>`
      select
        coalesce(sum(grand_total) filter (where fulfillment_status <> 'cancelled'), 0) as gmv,
        count(*)::int as orders
      from orders
      where (placed_at at time zone 'Asia/Dhaka')::date
            > (now() at time zone 'Asia/Dhaka')::date - 30
    `;

    const signups = await tx<{ n: number }[]>`
      select count(*)::int as n from tenant
      where (created_at at time zone 'Asia/Dhaka')::date
            > (now() at time zone 'Asia/Dhaka')::date - 30
    `;

    const series = await tx<{ day: string; count: number }[]>`
      select d::date::text as day, count(t.id)::int as count
      from generate_series(
        (now() at time zone 'Asia/Dhaka')::date - 13,
        (now() at time zone 'Asia/Dhaka')::date,
        interval '1 day'
      ) d
      left join tenant t on (t.created_at at time zone 'Asia/Dhaka')::date = d::date
      group by d order by d
    `;

    const byPlan = await tx<{ plan: string; tenants: number; mrr: string }[]>`
      select p.name as plan, count(*)::int as tenants,
        coalesce(sum(case when p.billing_interval = 'yearly' then p.price_bdt / 12 else p.price_bdt end), 0) as mrr
      from subscription s
      join plan p on p.id = s.plan_id
      where s.status = 'active'
      group by p.name order by mrr desc
    `;

    return {
      tenants: {
        total: byStatus.reduce((s, r) => s + r.n, 0),
        trial: get("trial"),
        active: get("active"),
        pastDue: get("past_due"),
        suspended: get("suspended"),
        cancelled: get("cancelled"),
      },
      mrr,
      arr: mrr * 12,
      gmv30d: Number(gmv[0]?.gmv ?? 0),
      orders30d: gmv[0]?.orders ?? 0,
      signups30d: signups[0]?.n ?? 0,
      liveStores: get("active") + get("trial"),
      signupSeries: series.map((r) => ({ day: r.day, count: r.count })),
      mrrByPlan: byPlan.map((r) => ({ plan: r.plan, tenants: r.tenants, mrr: Number(r.mrr) })),
    };
  });
}
