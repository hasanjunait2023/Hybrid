// Customers data layer (blueprint S-CUSTOMERS 1.4). Reads via withTenant (RLS).
// Note/tag mutations live in the Server Action. Customer counters
// (orders_count / total_spent) are maintained by placeOrder.
import { withTenant } from "@hybrid/db";

export interface CustomerListRow {
  id: string;
  name: string | null;
  phone: string | null;
  ordersCount: number;
  totalSpent: number;
  tags: string[];
  lastOrderAt: string | null;
}

export interface CustomerListFilter {
  /** name or phone search. */
  query?: string;
  sort?: "recent" | "spend";
}

export async function listCustomers(
  tenantId: string,
  userId: string,
  filter: CustomerListFilter = {},
): Promise<CustomerListRow[]> {
  const query = filter.query?.trim() ? `%${filter.query.trim()}%` : null;
  const sortBySpend = filter.sort === "spend";

  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        name: string | null;
        phone: string | null;
        orders_count: number;
        total_spent: string;
        tags: string[];
        last_order_at: string | null;
      }[]
    >`
      select c.id, c.name, c.phone, c.orders_count, c.total_spent, c.tags,
        (select max(o.placed_at) from orders o where o.customer_id = c.id) as last_order_at
      from customer c
      where (${query}::text is null or c.name ilike ${query} or c.phone ilike ${query})
      order by
        case when ${sortBySpend} then c.total_spent end desc nulls last,
        (select max(o.placed_at) from orders o where o.customer_id = c.id) desc nulls last,
        c.created_at desc
      limit 200
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    ordersCount: r.orders_count,
    totalSpent: Number(r.total_spent),
    tags: r.tags ?? [],
    lastOrderAt: r.last_order_at,
  }));
}

export interface CustomerStats {
  total: number;
  repeat: number;
  totalRevenue: number;
  avgSpend: number;
}

// Store-wide customer summary for the list-page strip. `repeat` = customers
// with more than one order (the loyalty signal). Denormalized counters on
// `customer` keep this a single cheap aggregate.
export async function getCustomerStats(
  tenantId: string,
  userId: string,
): Promise<CustomerStats> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ total: number; repeat: number; total_revenue: string; avg_spend: string }[]>`
      select
        count(*)::int as total,
        count(*) filter (where orders_count > 1)::int as repeat,
        coalesce(sum(total_spent), 0) as total_revenue,
        coalesce(round(avg(total_spent) filter (where orders_count > 0)), 0) as avg_spend
      from customer
    `,
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    repeat: r?.repeat ?? 0,
    totalRevenue: Number(r?.total_revenue ?? 0),
    avgSpend: Number(r?.avg_spend ?? 0),
  };
}

export interface CustomerAddress {
  id: string;
  recipient: string | null;
  phone: string | null;
  division: string | null;
  district: string | null;
  thana: string | null;
  line: string | null;
  isDefault: boolean;
}

export interface CustomerOrderRow {
  id: string;
  orderNumber: number;
  grandTotal: number;
  fulfillmentStatus: string;
  paymentStatus: string;
  placedAt: string;
}

export interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  tags: string[];
  ordersCount: number;
  totalSpent: number;
  /** delivered vs returned ratio signals (DESIGN §P5 COD reliability). */
  deliveredCount: number;
  returnedCount: number;
  addresses: CustomerAddress[];
  orders: CustomerOrderRow[];
  /** Monthly spend history (last 12 months) for timeline chart. */
  monthlySpend?: { month: string; orders: number; spent: number }[];
  /** Communication log: SMS sent + emails sent for this customer. */
  communications?: {
    channel: "sms" | "email";
    templateKey: string;
    sentAt: string;
    status: string;
  }[];
}

export async function getCustomerDetail(
  tenantId: string,
  userId: string,
  customerId: string,
): Promise<CustomerDetail | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        name: string | null;
        phone: string | null;
        email: string | null;
        note: string | null;
        tags: string[];
        orders_count: number;
        total_spent: string;
      }[]
    >`
      select id, name, phone, email, note, tags, orders_count, total_spent
      from customer where id = ${customerId} limit 1
    `;
    const c = rows[0];
    if (!c) return null;

    const addresses = await tx<
      {
        id: string;
        recipient_name: string | null;
        phone: string | null;
        division: string | null;
        district: string | null;
        thana: string | null;
        address_line: string | null;
        is_default: boolean;
      }[]
    >`
      select id, recipient_name, phone, division, district, thana, address_line, is_default
      from customer_address where customer_id = ${customerId}
      order by is_default desc, created_at desc
    `;

    const orders = await tx<
      {
        id: string;
        order_number: string;
        grand_total: string;
        fulfillment_status: string;
        payment_status: string;
        placed_at: string;
      }[]
    >`
      select id, order_number, grand_total, fulfillment_status, payment_status, placed_at
      from orders where customer_id = ${customerId} order by placed_at desc limit 50
    `;

    const ratio = await tx<{ delivered: number; returned: number }[]>`
      select
        count(*) filter (where fulfillment_status = 'delivered')::int as delivered,
        count(*) filter (where fulfillment_status = 'returned')::int as returned
      from orders where customer_id = ${customerId}
    `;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      note: c.note,
      tags: c.tags ?? [],
      ordersCount: c.orders_count,
      totalSpent: Number(c.total_spent),
      deliveredCount: ratio[0]?.delivered ?? 0,
      returnedCount: ratio[0]?.returned ?? 0,
      addresses: addresses.map((a) => ({
        id: a.id,
        recipient: a.recipient_name,
        phone: a.phone,
        division: a.division,
        district: a.district,
        thana: a.thana,
        line: a.address_line,
        isDefault: a.is_default,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: Number(o.order_number),
        grandTotal: Number(o.grand_total),
        fulfillmentStatus: o.fulfillment_status,
        paymentStatus: o.payment_status,
        placedAt: o.placed_at,
      })),
      // Monthly spend series: 12 months ending current month, zero-filled.
      monthlySpend: (await tx<{ month: string; orders: number; spent: string }[]>`
        select
          m::date::text as month,
          coalesce(count(o.id), 0)::int as orders,
          coalesce(sum(o.grand_total) filter (where o.fulfillment_status <> 'cancelled'), 0) as spent
        from generate_series(
          date_trunc('month', (now() at time zone 'Asia/Dhaka')::date - interval '11 months'),
          date_trunc('month', (now() at time zone 'Asia/Dhaka')::date),
          interval '1 month'
        ) m
        left join orders o
          on o.customer_id = ${customerId}
          and date_trunc('month', o.placed_at at time zone 'Asia/Dhaka') = m
          and o.fulfillment_status <> 'cancelled'
        group by m
        order by m
      `).map((m) => ({
        month: m.month,
        orders: m.orders,
        spent: Number(m.spent),
      })),
      // Communication log: SMS + emails sent to this customer.
      // FEATURE-DEFERRED (comms-log surface): the sms_log + email_log tables and
      // a logger write-path don't exist yet (no migration, no logger). Returning
      // [] keeps the customer detail page working. Build the tables + log-on-send
      // before wiring this field — see BACKLOG.md (comms-log) and vault note
      // "10-Features/comms-log.md" (feature brief + schema sketch). NOT a stub:
      // the empty-array contract is documented and the page is tested with it.
      communications: [] as {
        channel: "sms" | "email";
        templateKey: string;
        sentAt: string;
        status: string;
      }[],
    };
  });
}

/** Phone → customer prefill for manual order entry (DESIGN §P3.4 heart). */
export interface CustomerPrefill {
  id: string;
  name: string | null;
  phone: string | null;
  address: CustomerAddress | null;
}

export async function findCustomerByPhone(
  tenantId: string,
  userId: string,
  phone: string,
): Promise<CustomerPrefill | null> {
  const normalized = phone.trim();
  if (!normalized) return null;

  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{ id: string; name: string | null; phone: string | null }[]>`
      select id, name, phone from customer where phone = ${normalized} limit 1
    `;
    const c = rows[0];
    if (!c) return null;

    const addrs = await tx<
      {
        id: string;
        recipient_name: string | null;
        phone: string | null;
        division: string | null;
        district: string | null;
        thana: string | null;
        address_line: string | null;
        is_default: boolean;
      }[]
    >`
      select id, recipient_name, phone, division, district, thana, address_line, is_default
      from customer_address where customer_id = ${c.id}
      order by is_default desc, created_at desc limit 1
    `;
    const a = addrs[0];
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: a
        ? {
            id: a.id,
            recipient: a.recipient_name,
            phone: a.phone,
            division: a.division,
            district: a.district,
            thana: a.thana,
            line: a.address_line,
            isDefault: a.is_default,
          }
        : null,
    };
  });
}
