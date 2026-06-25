// Tenant 360 (tenant roadmap PP1-A2). One tenant's full platform view for the
// super-admin: profile, owner, plan + subscription, usage vs limits, GMV/orders,
// domains, members. Cross-tenant read via asPlatformAdmin, filtered to the one
// tenant id. Hybrid's operational view — not a tenant-scoped (RLS) read.
import { asPlatformAdmin } from "@hybrid/db";

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  owner: { name: string | null; email: string | null } | null;
  plan: { name: string | null; priceBdt: number; maxProducts: number | null; maxOrdersMonth: number | null; maxStaff: number } | null;
  subscription: { status: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  usage: { products: number; ordersThisMonth: number; customers: number; members: number; domains: number };
  gmvAllTime: number;
  gmv30d: number;
  ordersAllTime: number;
}

export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  return asPlatformAdmin(async (tx) => {
    const head = await tx<
      {
        id: string;
        name: string;
        slug: string;
        status: string;
        created_at: string;
        owner_name: string | null;
        owner_email: string | null;
        plan_name: string | null;
        price_bdt: string | null;
        max_products: number | null;
        max_orders_month: number | null;
        max_staff: number | null;
        sub_status: string | null;
        period_end: string | null;
        cancel_at_period_end: boolean | null;
      }[]
    >`
      select
        t.id, t.name, t.slug::text as slug, t.status::text as status, t.created_at,
        u.full_name as owner_name, u.email::text as owner_email,
        p.name as plan_name, p.price_bdt, p.max_products, p.max_orders_month, p.max_staff,
        s.status::text as sub_status, s.current_period_end as period_end, s.cancel_at_period_end
      from tenant t
      left join app_user u on u.id = t.owner_user_id
      left join plan p on p.id = t.plan_id
      left join subscription s on s.tenant_id = t.id
      where t.id = ${tenantId}
    `;
    const h = head[0];
    if (!h) return null;

    const usage = await tx<
      { products: number; orders_month: number; customers: number; members: number; domains: number }[]
    >`
      select
        (select count(*) from product where tenant_id = ${tenantId})::int as products,
        (select count(*) from orders where tenant_id = ${tenantId}
           and date_trunc('month', placed_at at time zone 'Asia/Dhaka') = date_trunc('month', now() at time zone 'Asia/Dhaka'))::int as orders_month,
        (select count(*) from customer where tenant_id = ${tenantId})::int as customers,
        (select count(*) from tenant_member where tenant_id = ${tenantId})::int as members,
        (select count(*) from tenant_domain where tenant_id = ${tenantId})::int as domains
    `;
    const u = usage[0]!;

    const gmv = await tx<{ all: string; recent: string; n: number }[]>`
      select
        coalesce(sum(grand_total) filter (where fulfillment_status <> 'cancelled'), 0) as all,
        coalesce(sum(grand_total) filter (where fulfillment_status <> 'cancelled'
          and (placed_at at time zone 'Asia/Dhaka')::date > (now() at time zone 'Asia/Dhaka')::date - 30), 0) as recent,
        count(*)::int as n
      from orders where tenant_id = ${tenantId}
    `;
    const g = gmv[0]!;

    return {
      id: h.id,
      name: h.name,
      slug: h.slug,
      status: h.status,
      createdAt: h.created_at,
      owner: h.owner_name || h.owner_email ? { name: h.owner_name, email: h.owner_email } : null,
      plan: h.plan_name
        ? {
            name: h.plan_name,
            priceBdt: Number(h.price_bdt ?? 0),
            maxProducts: h.max_products,
            maxOrdersMonth: h.max_orders_month,
            maxStaff: h.max_staff ?? 1,
          }
        : null,
      subscription: h.sub_status
        ? { status: h.sub_status, periodEnd: h.period_end, cancelAtPeriodEnd: h.cancel_at_period_end ?? false }
        : null,
      usage: {
        products: u.products,
        ordersThisMonth: u.orders_month,
        customers: u.customers,
        members: u.members,
        domains: u.domains,
      },
      gmvAllTime: Number(g.all),
      gmv30d: Number(g.recent),
      ordersAllTime: g.n,
    };
  });
}
