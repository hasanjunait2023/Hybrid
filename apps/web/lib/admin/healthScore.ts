// Business Health Score + growth recommendations (Phase R2.3, AI Growth Coach).
// A deterministic 0–100 score over the signals a BD seller actually lives by —
// sales momentum, repeat rate, COD success, stock health, fulfilment backlog,
// activity — plus rule-based, action-linked recommendations. No external call:
// this is the credential-free core of the coach (the natural-language assistant
// in lib/ai/coach.ts is a separate, env-gated seam). All reads via withTenant.
import { withTenant } from "@hybrid/db";

export interface HealthSignals {
  revThisWeek: number;
  revLastWeek: number;
  delivered90: number;
  bad90: number; // cancelled + returned in last 90d
  pending: number;
  orders7d: number;
  totalCustomers: number;
  repeatCustomers: number;
  activeProducts: number;
  lowStockProducts: number;
  /** customers with ≥1 order but quiet >60 days — win-back pool. */
  lapsedCustomers: number;
}

export type HealthGrade = "A" | "B" | "C" | "D";

export interface HealthFactor {
  key: string;
  /** 0–100 sub-score. */
  score: number;
  weight: number;
}

export interface HealthRecommendation {
  key: string;
  severity: "high" | "medium" | "info";
  /** dynamic value for the i18n template (e.g. a count). */
  value?: number;
  ctaHref: string;
}

export interface BusinessHealth {
  score: number;
  grade: HealthGrade;
  factors: HealthFactor[];
  recommendations: HealthRecommendation[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ---- Pure scoring (unit-tested directly) -----------------------------------
export function computeHealth(s: HealthSignals): BusinessHealth {
  // Momentum — this week vs last.
  let momentum: number;
  if (s.revLastWeek <= 0) momentum = s.revThisWeek > 0 ? 75 : 50;
  else {
    const ratio = s.revThisWeek / s.revLastWeek;
    momentum = ratio >= 1.2 ? 100 : ratio >= 1 ? 82 : ratio >= 0.8 ? 58 : ratio >= 0.5 ? 35 : 15;
  }

  // Repeat rate — 40% repeat ⇒ full marks. Too few customers ⇒ neutral.
  const repeatRate = s.totalCustomers > 0 ? s.repeatCustomers / s.totalCustomers : 0;
  const repeat = s.totalCustomers < 5 ? 60 : clamp(repeatRate * 250);

  // COD success — delivered vs cancelled/returned over 90d. Sparse ⇒ neutral.
  const codDenom = s.delivered90 + s.bad90;
  const cod = codDenom < 5 ? 70 : clamp((s.delivered90 / codDenom) * 100);

  // Stock — share of active products low on stock.
  const lowShare = s.activeProducts > 0 ? s.lowStockProducts / s.activeProducts : 0;
  const stock = s.activeProducts === 0 ? 50 : clamp(100 - lowShare * 150);

  // Backlog — unconfirmed orders piling up.
  const backlog = s.pending === 0 ? 100 : s.pending <= 3 ? 80 : s.pending <= 10 ? 55 : 30;

  // Activity — orders in the last 7 days.
  const activity = s.orders7d >= 10 ? 100 : s.orders7d >= 3 ? 75 : s.orders7d >= 1 ? 55 : 20;

  const factors: HealthFactor[] = [
    { key: "momentum", score: momentum, weight: 0.2 },
    { key: "repeat", score: repeat, weight: 0.2 },
    { key: "cod", score: cod, weight: 0.2 },
    { key: "stock", score: stock, weight: 0.15 },
    { key: "backlog", score: backlog, weight: 0.1 },
    { key: "activity", score: activity, weight: 0.15 },
  ];
  const score = clamp(factors.reduce((sum, f) => sum + f.score * f.weight, 0));
  const grade: HealthGrade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";

  // ---- Recommendations — weakest-first, each linked to where to act ---------
  const recs: HealthRecommendation[] = [];
  if (s.pending > 3)
    recs.push({ key: "backlog", severity: "high", value: s.pending, ctaHref: "/admin/orders?status=pending" });
  if (codDenom >= 5 && s.delivered90 / codDenom < 0.7)
    recs.push({ key: "cod", severity: "high", value: Math.round((1 - s.delivered90 / codDenom) * 100), ctaHref: "/admin/orders" });
  if (s.lowStockProducts > 0)
    recs.push({ key: "stock", severity: "medium", value: s.lowStockProducts, ctaHref: "/admin/products?status=active" });
  if (s.lapsedCustomers > 0)
    recs.push({ key: "winback", severity: "medium", value: s.lapsedCustomers, ctaHref: "/admin/automations" });
  if (s.revLastWeek > 0 && s.revThisWeek < s.revLastWeek)
    recs.push({ key: "momentum", severity: "medium", ctaHref: "/admin/marketing" });
  if (s.orders7d === 0)
    recs.push({ key: "activity", severity: "info", ctaHref: "/admin/customers/insights" });
  if (s.totalCustomers >= 5 && repeatRate < 0.15)
    recs.push({ key: "loyalty", severity: "info", ctaHref: "/admin/automations" });

  return { score, grade, factors, recommendations: recs.slice(0, 5) };
}

// ---- Data fetch ------------------------------------------------------------
export async function getBusinessHealth(tenantId: string, userId: string): Promise<BusinessHealth> {
  const signals = await withTenant(tenantId, userId, async (tx) => {
    const o = await tx<
      {
        rev_this_week: string;
        rev_last_week: string;
        delivered_90: number;
        bad_90: number;
        pending: number;
        orders_7d: number;
      }[]
    >`
      select
        coalesce(sum(grand_total) filter (
          where placed_at >= date_trunc('week', now() at time zone 'Asia/Dhaka')
            and fulfillment_status <> 'cancelled'), 0) as rev_this_week,
        coalesce(sum(grand_total) filter (
          where placed_at >= date_trunc('week', now() at time zone 'Asia/Dhaka') - interval '7 days'
            and placed_at < date_trunc('week', now() at time zone 'Asia/Dhaka')
            and fulfillment_status <> 'cancelled'), 0) as rev_last_week,
        count(*) filter (where placed_at >= now() - interval '90 days' and fulfillment_status = 'delivered')::int as delivered_90,
        count(*) filter (where placed_at >= now() - interval '90 days' and fulfillment_status in ('cancelled','returned'))::int as bad_90,
        count(*) filter (where fulfillment_status = 'pending')::int as pending,
        count(*) filter (where placed_at >= now() - interval '7 days')::int as orders_7d
      from orders
    `;
    const c = await tx<{ total: number; repeat: number; lapsed: number }[]>`
      select
        count(*)::int as total,
        count(*) filter (where orders_count > 1)::int as repeat,
        count(*) filter (
          where orders_count >= 1
            and (select max(ord.placed_at) from orders ord where ord.customer_id = customer.id) <= now() - interval '60 days'
        )::int as lapsed
      from customer
    `;
    const p = await tx<{ active_products: number; low_products: number }[]>`
      select
        count(*) filter (where status = 'active')::int as active_products,
        count(*) filter (where status = 'active' and tracks and qty <= 5)::int as low_products
      from (
        select p.id, p.status,
          bool_or(coalesce(v.track_inventory, false)) as tracks,
          coalesce(sum(v.inventory_quantity) filter (where v.track_inventory), 0) as qty
        from product p
        left join product_variant v on v.product_id = p.id
        group by p.id, p.status
      ) s
    `;
    const oo = o[0];
    const cc = c[0];
    const pp = p[0];
    return {
      revThisWeek: Number(oo?.rev_this_week ?? 0),
      revLastWeek: Number(oo?.rev_last_week ?? 0),
      delivered90: oo?.delivered_90 ?? 0,
      bad90: oo?.bad_90 ?? 0,
      pending: oo?.pending ?? 0,
      orders7d: oo?.orders_7d ?? 0,
      totalCustomers: cc?.total ?? 0,
      repeatCustomers: cc?.repeat ?? 0,
      lapsedCustomers: cc?.lapsed ?? 0,
      activeProducts: pp?.active_products ?? 0,
      lowStockProducts: pp?.low_products ?? 0,
    } satisfies HealthSignals;
  });
  return computeHealth(signals);
}
