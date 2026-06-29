// Discounts data layer (blueprint S-DISCOUNTS 2.4). All reads go through
// withTenant (RLS). The admin Server Actions in
// app/(admin)/admin/discounts/actions.ts mutate and revalidate. The apply path
// (lib/commerce/placeOrder.ts) reads + locks the row at checkout — this module
// is the admin CRUD surface only.
//
// Numerals are Latin in admin (DESIGN §4.4); this module returns plain numbers
// and ISO date strings; formatting happens at the view layer.
import { withTenant } from "@hybrid/db";

export type DiscountType = "percentage" | "fixed_amount" | "free_shipping";
export type DiscountStatus = "active" | "scheduled" | "expired" | "disabled";

export interface AdminDiscountRow {
  id: string;
  code: string;
  title: string | null;
  type: DiscountType;
  value: number;
  minSubtotal: number;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: DiscountStatus;
}

interface DiscountDbRow {
  id: string;
  code: string;
  title: string | null;
  type: DiscountType;
  value: string;
  min_subtotal: string;
  usage_limit: number | null;
  used_count: number;
  per_customer_limit: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  status: DiscountStatus;
}

function toRow(r: DiscountDbRow): AdminDiscountRow {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    type: r.type,
    value: Number(r.value),
    minSubtotal: Number(r.min_subtotal),
    usageLimit: r.usage_limit,
    usedCount: r.used_count,
    perCustomerLimit: r.per_customer_limit,
    startsAt: r.starts_at ? r.starts_at.toISOString() : null,
    endsAt: r.ends_at ? r.ends_at.toISOString() : null,
    status: r.status,
  };
}

// Per-code performance: how many orders used each code, the total discount
// given away, and the gross revenue those orders brought in. Cancelled orders
// are excluded (no revenue). Codes are the order-time snapshot (orders.discount_code),
// so a since-deleted code still shows its historical impact.
export interface DiscountPerformanceRow {
  code: string;
  ordersCount: number;
  totalDiscount: number;
  revenue: number;
}

export async function getDiscountPerformance(
  tenantId: string,
  userId: string,
): Promise<DiscountPerformanceRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ code: string; orders_count: string; total_discount: string; revenue: string }[]>`
      select discount_code as code,
             count(*)::bigint as orders_count,
             coalesce(sum(discount_total), 0) as total_discount,
             coalesce(sum(grand_total), 0) as revenue
        from orders
       where discount_code is not null
         and fulfillment_status <> 'cancelled'
       group by discount_code
       order by sum(grand_total) desc
    `,
  );
  return rows.map((r) => ({
    code: r.code,
    ordersCount: Number(r.orders_count),
    totalDiscount: Number(r.total_discount),
    revenue: Number(r.revenue),
  }));
}

export async function listDiscounts(
  tenantId: string,
  userId: string,
): Promise<AdminDiscountRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<DiscountDbRow[]>`
      select id, code, title, type, value, min_subtotal,
             usage_limit, used_count, per_customer_limit,
             starts_at, ends_at, status
        from discount
       order by created_at desc
    `,
  );
  return rows.map(toRow);
}

export async function getDiscount(
  tenantId: string,
  userId: string,
  discountId: string,
): Promise<AdminDiscountRow | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<DiscountDbRow[]>`
      select id, code, title, type, value, min_subtotal,
             usage_limit, used_count, per_customer_limit,
             starts_at, ends_at, status
        from discount
       where id = ${discountId}
       limit 1
    `,
  );
  return rows[0] ? toRow(rows[0]) : null;
}
