// Customer segments data layer (admin). A segment is a named, reusable filter:
// minimum orders, minimum spend, and an optional tag. All via withTenant (RLS).
import { withTenant } from "@hybrid/db";

export interface CustomerSegment {
  id: string;
  name: string;
  minOrders: number;
  minSpent: number;
  tag: string | null;
  matchCount: number;
}

// All segments with the live count of customers each one currently matches.
export async function listSegments(
  tenantId: string,
  userId: string,
): Promise<CustomerSegment[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        name: string;
        min_orders: number;
        min_spent: string;
        tag: string | null;
        match_count: number;
      }[]
    >`
      select s.id, s.name, s.min_orders, s.min_spent, s.tag,
        (select count(*) from customer c
          where c.tenant_id = s.tenant_id
            and c.orders_count >= s.min_orders
            and c.total_spent >= s.min_spent
            and (s.tag is null or s.tag = any(c.tags)))::int as match_count
      from customer_segment s
      order by s.created_at desc
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    minOrders: r.min_orders,
    minSpent: Number(r.min_spent),
    tag: r.tag,
    matchCount: r.match_count,
  }));
}

export interface CreateSegmentInput {
  name: string;
  minOrders: number;
  minSpent: number;
  tag?: string | null;
}

export async function createSegment(
  tenantId: string,
  userId: string,
  input: CreateSegmentInput,
): Promise<{ id: string }> {
  const minOrders = Math.max(0, Math.trunc(input.minOrders));
  const minSpent = Math.max(0, input.minSpent);
  const tag = input.tag?.trim() || null;
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      insert into customer_segment (tenant_id, name, min_orders, min_spent, tag)
      values (${tenantId}, ${input.name.trim()}, ${minOrders}, ${minSpent}, ${tag})
      returning id
    `,
  );
  return { id: rows[0]!.id };
}

export async function deleteSegment(
  tenantId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`delete from customer_segment where id = ${id} and tenant_id = ${tenantId}`;
  });
}

export interface SegmentCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  ordersCount: number;
  totalSpent: number;
}

// The customers matching a saved segment's criteria (most-valuable first).
export async function getSegmentCustomers(
  tenantId: string,
  userId: string,
  segmentId: string,
): Promise<{ name: string; customers: SegmentCustomer[] } | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const seg = await tx<
      { name: string; min_orders: number; min_spent: string; tag: string | null }[]
    >`
      select name, min_orders, min_spent, tag from customer_segment where id = ${segmentId} limit 1
    `;
    const s = seg[0];
    if (!s) return null;

    const customers = await tx<
      { id: string; name: string | null; phone: string | null; orders_count: number; total_spent: string }[]
    >`
      select id, name, phone, orders_count, total_spent
        from customer
       where orders_count >= ${s.min_orders}
         and total_spent >= ${s.min_spent}
         and (${s.tag}::text is null or ${s.tag} = any(tags))
       order by total_spent desc
       limit 500
    `;
    return {
      name: s.name,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        ordersCount: c.orders_count,
        totalSpent: Number(c.total_spent),
      })),
    };
  });
}
