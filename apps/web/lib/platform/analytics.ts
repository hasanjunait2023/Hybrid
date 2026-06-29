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

export interface WholesaleStats {
  totalWholesalers: number;
  pendingKyc: number;
  wholesaleGmv30d: number;
  wholesaleOrders30d: number;
  wholesaleProductsCount: number;
  wholesaleByCategory: { category: string; count: number }[];
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

// Wholesale / B2B analytics for the super-admin dashboard. Cross-tenant
// aggregates: wholesaler count, pending KYC, wholesale GMV/orders/products.
export async function getWholesaleStats(): Promise<WholesaleStats> {
  return asPlatformAdmin(async (tx) => {
    const [wholesalerRow] = await tx<{ n: number; pending: number }[]>`
      select
        count(*)::int as n,
        count(*) filter (where kyc_status = 'pending' or kyc_status = 'submitted')::int as pending
      from tenant
      where business_type in ('wholesale'::tenant_business_type, 'both'::tenant_business_type)
    `;

    const [gmvRow] = await tx<{ gmv: string; orders: number }[]>`
      select
        coalesce(sum(so.grand_total), 0) as gmv,
        count(*)::int as orders
      from marketplace_suborder so
      join marketplace_order o on o.id = so.order_id
      where o.order_mode = 'wholesale'
        and o.status <> 'cancelled'
        and (o.created_at at time zone 'Asia/Dhaka')::date
            > (now() at time zone 'Asia/Dhaka')::date - 30
    `;

    const [productsRow] = await tx<{ n: number }[]>`
      select count(*)::int as n
      from marketplace_listing
      where is_wholesale = true
        and status = 'active'
        and hidden = false
    `;

    const byCategory = await tx<{ category: string; count: number }[]>`
      select
        coalesce(category, 'Uncategorized') as category,
        count(*)::int as count
      from marketplace_listing
      where is_wholesale = true
        and status = 'active'
        and hidden = false
      group by category
      order by count desc
      limit 20
    `;

    return {
      totalWholesalers: wholesalerRow?.n ?? 0,
      pendingKyc: wholesalerRow?.pending ?? 0,
      wholesaleGmv30d: Number(gmvRow?.gmv ?? 0),
      wholesaleOrders30d: gmvRow?.orders ?? 0,
      wholesaleProductsCount: productsRow?.n ?? 0,
      wholesaleByCategory: byCategory.map((r) => ({
        category: r.category,
        count: r.count,
      })),
    };
  });
}
