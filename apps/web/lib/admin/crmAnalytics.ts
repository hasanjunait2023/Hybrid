// CRM analytics — RFM distribution, churn-risk, cohort retention (Phase R1.5).
// The store-wide read of the same RFM-lite model the Customer 360 badge uses
// (lib/admin/customers.ts), plus who's slipping away and how cohorts retain.
// All via withTenant (RLS). Recency uses the Asia/Dhaka-agnostic UTC instant —
// day granularity, so timezone drift is immaterial.
import { withTenant } from "@hybrid/db";
import type { RfmSegment } from "@/lib/admin/customers";

export interface RfmDistribution {
  segment: RfmSegment;
  count: number;
  value: number;
}

// The CASE ladder mirrors rfmSegment() in lib/admin/customers.ts exactly — same
// thresholds, same precedence — so the distribution and the per-customer badge
// never disagree.
export async function getRfmDistribution(
  tenantId: string,
  userId: string,
): Promise<RfmDistribution[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ segment: string; count: number; value: string }[]>`
      with c as (
        select cu.id, cu.orders_count as freq, cu.total_spent as monetary,
          floor(extract(epoch from (now() - (
            select max(o.placed_at) from orders o
             where o.customer_id = cu.id and o.fulfillment_status <> 'cancelled'
          ))) / 86400)::int as recency
        from customer cu
      ),
      seg as (
        select id, monetary,
          case
            when freq = 0 or recency is null then 'new'
            when recency <= 45 and (freq >= 5 or monetary >= 50000) then 'champion'
            when recency <= 60 and freq >= 2 then 'loyal'
            when recency > 180 then 'lost'
            when recency > 120 then 'at_risk'
            else 'active'
          end as segment
        from c
      )
      select segment, count(*)::int as count, coalesce(sum(monetary), 0) as value
        from seg group by segment
    `,
  );
  const order: RfmSegment[] = ["champion", "loyal", "active", "at_risk", "lost", "new"];
  const byName = new Map(rows.map((r) => [r.segment, r]));
  return order.map((segment) => {
    const r = byName.get(segment);
    return { segment, count: r?.count ?? 0, value: Number(r?.value ?? 0) };
  });
}

export interface ChurnRiskCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  recencyDays: number;
}

// Customers slipping away: previously active (≥1 order) but quiet for a while,
// most-valuable first — the win-back shortlist. Threshold defaults to 120 days
// (the at_risk floor in the RFM model).
export async function getChurnRisk(
  tenantId: string,
  userId: string,
  thresholdDays = 120,
): Promise<ChurnRiskCustomer[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      { id: string; name: string | null; phone: string | null; orders_count: number; total_spent: string; last_order_at: string | null; recency_days: number }[]
    >`
      select cu.id, cu.name, cu.phone, cu.orders_count, cu.total_spent,
             lo.last_order_at,
             floor(extract(epoch from (now() - lo.last_order_at)) / 86400)::int as recency_days
        from customer cu
        join lateral (
          select max(o.placed_at) as last_order_at from orders o
           where o.customer_id = cu.id and o.fulfillment_status <> 'cancelled'
        ) lo on true
       where cu.orders_count >= 1
         and lo.last_order_at is not null
         and lo.last_order_at <= now() - make_interval(days => ${thresholdDays})
       order by cu.total_spent desc
       limit 100
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    ordersCount: r.orders_count,
    totalSpent: Number(r.total_spent),
    lastOrderAt: r.last_order_at,
    recencyDays: r.recency_days,
  }));
}

export interface RetentionCohort {
  /** acquisition month, ISO date (first of month, Dhaka). */
  cohort: string;
  customers: number;
  repeated: number;
  /** repeated / customers, 0–100. */
  repeatRate: number;
}

// Monthly acquisition cohorts (last 6) and how many of each came back for a
// second order — the retention signal, simple and honest.
export async function getRetentionCohorts(
  tenantId: string,
  userId: string,
): Promise<RetentionCohort[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ cohort: string; customers: number; repeated: number }[]>`
      with first_order as (
        select customer_id,
               min(placed_at) as first_at,
               count(*) as order_count
          from orders
         where fulfillment_status <> 'cancelled'
         group by customer_id
      )
      select date_trunc('month', first_at at time zone 'Asia/Dhaka')::date::text as cohort,
             count(*)::int as customers,
             count(*) filter (where order_count >= 2)::int as repeated
        from first_order
       where first_at >= date_trunc('month', now() at time zone 'Asia/Dhaka') - interval '5 months'
       group by 1
       order by 1
    `,
  );
  return rows.map((r) => ({
    cohort: r.cohort,
    customers: r.customers,
    repeated: r.repeated,
    repeatRate: r.customers > 0 ? Math.round((r.repeated / r.customers) * 100) : 0,
  }));
}
