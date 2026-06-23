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
  lowStockCount: number;
  pendingConfirmCount: number;
  recentOrders: {
    id: string;
    orderNumber: number;
    customerName: string | null;
    grandTotal: number;
    fulfillmentStatus: string;
    placedAt: string;
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

    return {
      todayOrders: today[0]?.today_orders ?? 0,
      todayRevenue: Number(today[0]?.today_revenue ?? 0),
      yesterdayOrders: today[0]?.yesterday_orders ?? 0,
      codPendingAmount: Number(cod[0]?.amount ?? 0),
      codPendingCount: cod[0]?.n ?? 0,
      lowStockCount: lowStock[0]?.n ?? 0,
      pendingConfirmCount: pendingConfirm[0]?.n ?? 0,
      recentOrders: recent.map((r) => ({
        id: r.id,
        orderNumber: Number(r.order_number),
        customerName: r.customer_name,
        grandTotal: Number(r.grand_total),
        fulfillmentStatus: r.fulfillment_status,
        placedAt: r.placed_at,
      })),
    };
  });
}
