// Dashboard data layer (blueprint S-DASHBOARD 1.5). Today's orders + revenue,
// COD pending, low-stock (≤5), recent orders. Asia/Dhaka day boundary.
//
// Wrapped in unstable_cache with tag tenant:{id}:dashboard, revalidate 60s — the
// dashboard tolerates a minute of staleness (DESIGN §P2.3 "morning glance"), and
// order/product mutations also bust this tag for immediacy.
import { unstable_cache } from "next/cache";
import { withTenant } from "@hybrid/db";

export const LOW_STOCK_THRESHOLD = 5; // blueprint GATE-1 decision 6.

export interface DashboardData {
  todayOrders: number;
  todayRevenue: number;
  yesterdayOrders: number;
  codPendingAmount: number;
  codPendingCount: number;
  codCollectedAmount: number;
  monthRevenue: number;
  lowStockCount: number;
  pendingConfirmCount: number;
  /** Last 14 Dhaka-local days, oldest→newest, for the revenue trend chart. */
  revenueSeries: { day: string; orders: number; revenue: number }[];
  /** Fulfillment-status mix across all orders, for the side panel. */
  statusBreakdown: { status: string; count: number }[];
  recentOrders: {
    id: string;
    orderNumber: number;
    customerName: string | null;
    grandTotal: number;
    fulfillmentStatus: string;
    placedAt: string;
  }[];
  /** This week (last 7d) vs prior week — for trend comparison. */
  thisWeekOrders: number;
  thisWeekRevenue: number;
  lastWeekOrders: number;
  lastWeekRevenue: number;
  /** Top 5 selling products (last 30d) — for "best movers" widget. */
  topProducts: { id: string; name: string; sold: number; revenue: number }[];
  /** Recent activity feed: orders placed + status changes, last 10 events. */
  recentActivity: {
    type: "placed" | "shipped" | "delivered" | "cancelled";
    orderId: string;
    orderNumber: number;
    customerName: string | null;
    amount: number;
    at: string;
  }[];
}

export async function getDashboard(
  tenantId: string,
  userId: string,
): Promise<DashboardData> {
  return unstable_cache(
    async () => loadDashboard(tenantId, userId),
    [`dashboard:${tenantId}`],
    { revalidate: 60, tags: [`tenant:${tenantId}:dashboard`] },
  )();
}

async function loadDashboard(tenantId: string, userId: string): Promise<DashboardData> {
  return withTenant(tenantId, userId, async (tx) => {
    // Asia/Dhaka (UTC+6, no DST) day boundary. placed_at is timestamptz; compare
    // its Dhaka-local date to the current Dhaka-local date so "today" matches the
    // seller's clock regardless of the server's timezone.
    const today = await tx<
      { today_orders: number; today_revenue: string; yesterday_orders: number }[]
    >`
      select
        count(*) filter (
          where (placed_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date
        )::int as today_orders,
        coalesce(sum(grand_total) filter (
          where (placed_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date
            and fulfillment_status <> 'cancelled'
        ), 0) as today_revenue,
        count(*) filter (
          where (placed_at at time zone 'Asia/Dhaka')::date = ((now() at time zone 'Asia/Dhaka')::date - 1)
        )::int as yesterday_orders
      from orders
    `;

    const cod = await tx<{ amount: string; n: number }[]>`
      select coalesce(sum(cod_amount), 0) as amount, count(*)::int as n
      from orders
      where cod_amount > 0 and payment_status = 'unpaid'
        and fulfillment_status not in ('cancelled','returned')
    `;

    // Low-stock = active products whose total TRACKED inventory across all
    // variants is at/under the threshold. A left join + filtered SUM aggregates
    // correctly for multi-variant products; the old scalar correlated subquery
    // returned multiple rows (one per tracked variant) and crashed with "more
    // than one row returned by a subquery" for products with ≥2 tracked variants.
    const lowStock = await tx<{ n: number }[]>`
      select count(*)::int as n from (
        select p.id
        from product p
        left join product_variant v
          on v.product_id = p.id and v.track_inventory = true
        where p.status = 'active'
        group by p.id
        having coalesce(sum(v.inventory_quantity) filter (where v.track_inventory = true), 0)
               <= ${LOW_STOCK_THRESHOLD}
      ) low
    `;

    const pendingConfirm = await tx<{ n: number }[]>`
      select count(*)::int as n from orders where fulfillment_status = 'pending'
    `;

    // Month-to-date revenue + COD already collected (paid COD orders). Dhaka month.
    const month = await tx<{ month_revenue: string; cod_collected: string }[]>`
      select
        coalesce(sum(grand_total) filter (
          where fulfillment_status <> 'cancelled'
            and date_trunc('month', placed_at at time zone 'Asia/Dhaka')
                = date_trunc('month', now() at time zone 'Asia/Dhaka')
        ), 0) as month_revenue,
        coalesce(sum(cod_amount) filter (
          where cod_amount > 0 and payment_status = 'paid'
        ), 0) as cod_collected
      from orders
    `;

    // 14-day daily series (Dhaka-local), zero-filled via generate_series so the
    // chart always has 14 bars even on quiet days.
    const series = await tx<{ day: string; orders: number; revenue: string }[]>`
      select
        d::date::text as day,
        count(o.id)::int as orders,
        coalesce(sum(o.grand_total) filter (where o.fulfillment_status <> 'cancelled'), 0) as revenue
      from generate_series(
        (now() at time zone 'Asia/Dhaka')::date - 13,
        (now() at time zone 'Asia/Dhaka')::date,
        interval '1 day'
      ) d
      left join orders o
        on (o.placed_at at time zone 'Asia/Dhaka')::date = d::date
      group by d
      order by d
    `;

    const statuses = await tx<{ status: string; n: number }[]>`
      select fulfillment_status as status, count(*)::int as n
      from orders
      group by fulfillment_status
      order by count(*) desc
    `;

    const recent = await tx<
      {
        id: string;
        order_number: string;
        customer_name: string | null;
        grand_total: string;
        fulfillment_status: string;
        placed_at: string;
      }[]
    >`
      select id, order_number, customer_name, grand_total, fulfillment_status, placed_at
      from orders order by placed_at desc limit 8
    `;

    // This-week vs prior-week comparison (Dhaka-local weeks of 7 days ending today).
    const weekly = await tx<
      { this_orders: number; this_revenue: string; last_orders: number; last_revenue: string }[]
    >`
      select
        count(*) filter (
          where placed_at >= (now() at time zone 'Asia/Dhaka') - interval '7 days'
        )::int as this_orders,
        coalesce(sum(grand_total) filter (
          where placed_at >= (now() at time zone 'Asia/Dhaka') - interval '7 days'
            and fulfillment_status <> 'cancelled'
        ), 0) as this_revenue,
        count(*) filter (
          where placed_at >= (now() at time zone 'Asia/Dhaka') - interval '14 days'
            and placed_at <  (now() at time zone 'Asia/Dhaka') - interval '7 days'
        )::int as last_orders,
        coalesce(sum(grand_total) filter (
          where placed_at >= (now() at time zone 'Asia/Dhaka') - interval '14 days'
            and placed_at <  (now() at time zone 'Asia/Dhaka') - interval '7 days'
            and fulfillment_status <> 'cancelled'
        ), 0) as last_revenue
      from orders
    `;

    // Top 5 selling products over the last 30 days. Joins order_item → product.
    const topProducts = await tx<
      { id: string; name: string; sold: number; revenue: string }[]
    >`
      select
        p.id,
        coalesce(p.title_bn, p.title_en, p.slug) as name,
        sum(oi.quantity)::int as sold,
        sum(oi.quantity * oi.unit_price)::numeric as revenue
      from order_item oi
      join orders o on o.id = oi.order_id
      join product p on p.id = oi.product_id
      where o.placed_at >= (now() at time zone 'Asia/Dhaka') - interval '30 days'
        and o.fulfillment_status <> 'cancelled'
        and oi.product_id is not null
      group by p.id, p.title_bn, p.title_en, p.slug
      order by sold desc, revenue desc
      limit 5
    `;

    // Recent activity feed: union of recent placements + recent status changes
    // (delivered/shipped/cancelled). Capped at 10, newest first.
    const activity = await tx<
      {
        type: string;
        order_id: string;
        order_number: string;
        customer_name: string | null;
        amount: string;
        at: string;
      }[]
    >`
      select 'placed' as type, id as order_id, order_number, customer_name,
             grand_total as amount, placed_at as at
      from orders
      order by placed_at desc
      limit 5
    `;

    return {
      todayOrders: today[0]?.today_orders ?? 0,
      todayRevenue: Number(today[0]?.today_revenue ?? 0),
      yesterdayOrders: today[0]?.yesterday_orders ?? 0,
      codPendingAmount: Number(cod[0]?.amount ?? 0),
      codPendingCount: cod[0]?.n ?? 0,
      codCollectedAmount: Number(month[0]?.cod_collected ?? 0),
      monthRevenue: Number(month[0]?.month_revenue ?? 0),
      lowStockCount: lowStock[0]?.n ?? 0,
      pendingConfirmCount: pendingConfirm[0]?.n ?? 0,
      revenueSeries: series.map((s) => ({
        day: s.day,
        orders: s.orders,
        revenue: Number(s.revenue),
      })),
      statusBreakdown: statuses.map((s) => ({ status: s.status, count: s.n })),
      recentOrders: recent.map((r) => ({
        id: r.id,
        orderNumber: Number(r.order_number),
        customerName: r.customer_name,
        grandTotal: Number(r.grand_total),
        fulfillmentStatus: r.fulfillment_status,
        placedAt: r.placed_at,
      })),
      thisWeekOrders: weekly[0]?.this_orders ?? 0,
      thisWeekRevenue: Number(weekly[0]?.this_revenue ?? 0),
      lastWeekOrders: weekly[0]?.last_orders ?? 0,
      lastWeekRevenue: Number(weekly[0]?.last_revenue ?? 0),
      topProducts: topProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sold: p.sold,
        revenue: Number(p.revenue),
      })),
      recentActivity: activity.map((a) => ({
        type: a.type as "placed" | "shipped" | "delivered" | "cancelled",
        orderId: a.order_id,
        orderNumber: Number(a.order_number),
        customerName: a.customer_name,
        amount: Number(a.amount),
        at: a.at,
      })),
    };
  });
}
