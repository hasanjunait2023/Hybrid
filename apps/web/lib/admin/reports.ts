// Reports & Finance data layer (tenant roadmap P2-1). All reads via withTenant
// (RLS). Computed from existing orders / order_item / product_variant / shipment
// — no new schema. Range-bounded by Asia/Dhaka local dates. Money as numbers
// (postgres.js returns numeric as string → Number()).
import { withTenant } from "@hybrid/db";
import type { DateRange } from "./reports-shared";

// Re-export client-safe helpers from reports-shared.ts (no DB import, so they
// are safe to use from "use client" components without bundling postgres.js
// or node:crypto).
export type { DateRange, ReportPreset } from "./reports-shared";
export {
  presetRange,
  defaultRange,
  toCsv,
  todayDhaka,
  addDays,
} from "./reports-shared";

export interface SalesReport {
  days: { day: string; orders: number; revenue: number }[];
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

// Daily orders + revenue across the range (zero-filled), excluding cancelled.
export async function getSalesReport(
  tenantId: string,
  userId: string,
  range: DateRange,
): Promise<SalesReport> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ day: string; orders: number; revenue: string }[]>`
      select
        d::date::text as day,
        count(o.id)::int as orders,
        coalesce(sum(o.grand_total) filter (where o.fulfillment_status <> 'cancelled'), 0) as revenue
      from generate_series(${range.from}::date, ${range.to}::date, interval '1 day') d
      left join orders o
        on (o.placed_at at time zone 'Asia/Dhaka')::date = d::date
       and o.tenant_id = ${tenantId}
      group by d
      order by d
    `,
  );
  const days = rows.map((r) => ({ day: r.day, orders: r.orders, revenue: Number(r.revenue) }));
  const totalOrders = days.reduce((s, x) => s + x.orders, 0);
  const totalRevenue = days.reduce((s, x) => s + x.revenue, 0);
  return {
    days,
    totalOrders,
    totalRevenue,
    avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
  };
}

export interface TopProduct {
  productId: string | null;
  title: string;
  units: number;
  revenue: number;
}

export async function getTopProducts(
  tenantId: string,
  userId: string,
  range: DateRange,
  limit = 10,
): Promise<TopProduct[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ product_id: string | null; title: string; units: number; revenue: string }[]>`
      select oi.product_id, oi.title,
             sum(oi.quantity)::int as units,
             coalesce(sum(oi.line_total), 0) as revenue
      from order_item oi
      join orders o on o.id = oi.order_id
      where o.fulfillment_status <> 'cancelled'
        and (o.placed_at at time zone 'Asia/Dhaka')::date between ${range.from}::date and ${range.to}::date
      group by oi.product_id, oi.title
      order by revenue desc
      limit ${limit}
    `,
  );
  return rows.map((r) => ({
    productId: r.product_id,
    title: r.title,
    units: r.units,
    revenue: Number(r.revenue),
  }));
}

export interface StatusReport {
  byStatus: { status: string; count: number }[];
  total: number;
  /** delivered / (delivered + cancelled + returned) — the fulfilment success rate. */
  deliveryRate: number;
  /** (cancelled + returned) / total — the loss rate. */
  rtoRate: number;
}

export async function getStatusReport(
  tenantId: string,
  userId: string,
  range: DateRange,
): Promise<StatusReport> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ status: string; n: number }[]>`
      select fulfillment_status as status, count(*)::int as n
      from orders
      where (placed_at at time zone 'Asia/Dhaka')::date between ${range.from}::date and ${range.to}::date
      group by fulfillment_status
      order by count(*) desc
    `,
  );
  const byStatus = rows.map((r) => ({ status: r.status, count: r.n }));
  const total = byStatus.reduce((s, x) => s + x.count, 0);
  const get = (st: string) => byStatus.find((x) => x.status === st)?.count ?? 0;
  const delivered = get("delivered");
  const bad = get("cancelled") + get("returned");
  return {
    byStatus,
    total,
    deliveryRate: delivered + bad > 0 ? delivered / (delivered + bad) : 0,
    rtoRate: total > 0 ? bad / total : 0,
  };
}

export interface CodReport {
  codOut: number; // expected COD across non-terminal orders
  codCollected: number; // courier-reported collected
  codRemitted: number; // paid out to seller
  codPending: number; // collected but not yet remitted
}

export async function getCodReport(tenantId: string, userId: string): Promise<CodReport> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ out: string; collected: string; remitted: string }[]>`
      select
        coalesce(sum(cod_amount) filter (where cod_status in ('pending')), 0) as out,
        coalesce(sum(cod_collected), 0) as collected,
        coalesce(sum(cod_remitted), 0) as remitted
      from shipment
    `,
  );
  const r = rows[0];
  const collected = Number(r?.collected ?? 0);
  const remitted = Number(r?.remitted ?? 0);
  return {
    codOut: Number(r?.out ?? 0),
    codCollected: collected,
    codRemitted: remitted,
    codPending: Math.max(0, collected - remitted),
  };
}

export interface ProfitReport {
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** gross margin 0–1; 0 when revenue is 0. */
  margin: number;
  /** true when at least one sold variant has a cost_price set. */
  hasCost: boolean;
}

// Gross profit = revenue − COGS (cost_price × qty) over non-cancelled orders.
// cost_price is optional per variant; hasCost flags whether the margin is real.
export async function getProfitReport(
  tenantId: string,
  userId: string,
  range: DateRange,
): Promise<ProfitReport> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ revenue: string; cogs: string; with_cost: number }[]>`
      select
        coalesce(sum(oi.line_total), 0) as revenue,
        coalesce(sum(v.cost_price * oi.quantity), 0) as cogs,
        count(v.cost_price)::int as with_cost
      from order_item oi
      join orders o on o.id = oi.order_id
      left join product_variant v on v.id = oi.variant_id
      where o.fulfillment_status <> 'cancelled'
        and (o.placed_at at time zone 'Asia/Dhaka')::date between ${range.from}::date and ${range.to}::date
    `,
  );
  const r = rows[0];
  const revenue = Number(r?.revenue ?? 0);
  const cogs = Number(r?.cogs ?? 0);
  const grossProfit = revenue - cogs;
  return {
    revenue,
    cogs,
    grossProfit,
    margin: revenue > 0 ? grossProfit / revenue : 0,
    hasCost: (r?.with_cost ?? 0) > 0,
  };
}

export interface CourierPerformance {
  provider: string;
  sent: number;
  delivered: number;
  returned: number;
  inTransit: number;
  /** delivered / (delivered + returned) — success among resolved parcels. */
  deliveryRate: number;
  /** returned / sent — RTO share. */
  rtoRate: number;
  codCollected: number;
}

// Per-courier delivery vs RTO from the shipment ledger — lets a seller choose
// couriers by real performance (the multi-courier decision input). Range-bounded
// by the shipment created_at (Dhaka-local).
export async function getCourierPerformance(
  tenantId: string,
  userId: string,
  range: DateRange,
): Promise<CourierPerformance[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        provider: string;
        sent: number;
        delivered: number;
        returned: number;
        in_transit: number;
        cod_collected: string;
      }[]
    >`
      select
        provider,
        count(*)::int as sent,
        count(*) filter (where status = 'delivered')::int as delivered,
        count(*) filter (where status = 'returned')::int as returned,
        count(*) filter (where status in ('in_transit', 'picked_up'))::int as in_transit,
        coalesce(sum(cod_collected), 0) as cod_collected
      from shipment
      where (created_at at time zone 'Asia/Dhaka')::date between ${range.from}::date and ${range.to}::date
      group by provider
      order by sent desc
    `,
  );
  return rows.map((r) => {
    const resolved = r.delivered + r.returned;
    return {
      provider: r.provider,
      sent: r.sent,
      delivered: r.delivered,
      returned: r.returned,
      inTransit: r.in_transit,
      deliveryRate: resolved > 0 ? r.delivered / resolved : 0,
      rtoRate: r.sent > 0 ? r.returned / r.sent : 0,
      codCollected: Number(r.cod_collected),
    };
  });
}

export interface FunnelReport {
  productViews: number;
  cartAdds: number;
  orders: number;
  /** cart adds / product views */
  viewToCartRate: number;
  /** orders / cart adds */
  cartToOrderRate: number;
  /** orders / product views (full funnel) */
  overallConversionRate: number;
}

// Storefront conversion funnel for the date range using the analytics_event table.
// product.viewed → cart.added → order.placed (internal first-party events).
export async function getFunnelReport(
  tenantId: string,
  userId: string,
  range: DateRange,
): Promise<FunnelReport> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{
      views: number;
      cart_adds: number;
      orders_placed: number;
    }[]>`
      select
        count(*) filter (where type = 'product.viewed')::int  as views,
        count(*) filter (where type = 'cart.added')::int      as cart_adds,
        count(*) filter (where type = 'order.placed')::int    as orders_placed
      from analytics_event
      where created_at::date between ${range.from}::date and ${range.to}::date
    `;
    const r = rows[0] ?? { views: 0, cart_adds: 0, orders_placed: 0 };
    return {
      productViews: r.views,
      cartAdds: r.cart_adds,
      orders: r.orders_placed,
      viewToCartRate: r.views > 0 ? r.cart_adds / r.views : 0,
      cartToOrderRate: r.cart_adds > 0 ? r.orders_placed / r.cart_adds : 0,
      overallConversionRate: r.views > 0 ? r.orders_placed / r.views : 0,
    };
  });
}

