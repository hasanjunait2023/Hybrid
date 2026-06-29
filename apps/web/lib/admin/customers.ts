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

// ---------------------------------------------------------------------------
// Customer 360 — the unified CRM view (CRM Phase R1.1).
//
// One chronological timeline merging every touchpoint we hold on a customer:
// orders, payments, ledger (বাকি/due) entries, internal notes and returns — plus
// the derived CRM signals a seller actually acts on: AOV, last-seen recency, an
// RFM-lite segment, and outstanding due. Everything reads via withTenant (RLS);
// payments/notes/returns have no customer_id of their own, so they join through
// orders.customer_id — the legitimate tenant-scoped path.
// ---------------------------------------------------------------------------

export type Customer360EventType = "order" | "payment" | "ledger" | "note" | "return";

export interface Customer360Event {
  type: Customer360EventType;
  at: string;
  orderId: string | null;
  orderNumber: number | null;
  /** money where applicable (order total, payment amount, ledger amount, refund) */
  amount: number | null;
  /** sub-status: fulfillment / payment status, ledger type, return status */
  kind: string | null;
  /** free text: note body, ledger note, return reason */
  text: string | null;
}

export type RfmSegment = "new" | "champion" | "loyal" | "active" | "at_risk" | "lost";

export interface Customer360 extends CustomerDetail {
  /** average order value (total_spent / orders_count, 0 when no orders). */
  aov: number;
  lastOrderAt: string | null;
  recencyDays: number | null;
  rfmSegment: RfmSegment;
  /** current outstanding due (বাকি) — latest customer_ledger running balance. */
  ledgerBalance: number;
  timeline: Customer360Event[];
}

// RFM-lite segmentation. Recency = days since last non-cancelled order,
// Frequency = lifetime order count, Monetary = lifetime spend. Tuned for BD
// retail rhythms; a fuller cohort/quintile model lands in R1.5.
function rfmSegment(
  frequency: number,
  monetary: number,
  recencyDays: number | null,
): RfmSegment {
  if (frequency === 0 || recencyDays === null) return "new";
  if (recencyDays <= 45 && (frequency >= 5 || monetary >= 50000)) return "champion";
  if (recencyDays <= 60 && frequency >= 2) return "loyal";
  if (recencyDays > 180) return "lost";
  if (recencyDays > 120) return "at_risk";
  return "active";
}

export async function getCustomer360(
  tenantId: string,
  userId: string,
  customerId: string,
): Promise<Customer360 | null> {
  const base = await getCustomerDetail(tenantId, userId, customerId);
  if (!base) return null;

  const enrich = await withTenant(tenantId, userId, async (tx) => {
    const agg = await tx<{ last_order_at: string | null; recency_days: number | null }[]>`
      select max(placed_at) as last_order_at,
             floor(extract(epoch from (now() - max(placed_at))) / 86400)::int as recency_days
      from orders
      where customer_id = ${customerId} and fulfillment_status <> 'cancelled'
    `;

    const payments = await tx<
      { amount: string; status: string; at: string; order_id: string; order_number: string }[]
    >`
      select p.amount, p.status, coalesce(p.paid_at, p.created_at) as at,
             o.id as order_id, o.order_number
      from payment p join orders o on o.id = p.order_id
      where o.customer_id = ${customerId}
      order by at desc limit 50
    `;

    const ledger = await tx<
      { type: string; amount: string; balance: string; note: string | null; created_at: string }[]
    >`
      select type, amount, balance, note, created_at
      from customer_ledger where customer_id = ${customerId}
      order by created_at desc limit 50
    `;

    const notes = await tx<
      { body: string; created_at: string; order_id: string; order_number: string }[]
    >`
      select n.body, n.created_at, o.id as order_id, o.order_number
      from order_note n join orders o on o.id = n.order_id
      where o.customer_id = ${customerId}
      order by n.created_at desc limit 50
    `;

    const returns = await tx<
      { status: string; reason: string; refund_amount: string; created_at: string; order_id: string; order_number: string }[]
    >`
      select r.status, r.reason, r.refund_amount, r.created_at,
             o.id as order_id, o.order_number
      from return_request r join orders o on o.id = r.order_id
      where o.customer_id = ${customerId}
      order by r.created_at desc limit 50
    `;

    return { agg: agg[0], payments, ledger, notes, returns };
  });

  const events: Customer360Event[] = [
    ...base.orders.map<Customer360Event>((o) => ({
      type: "order",
      at: o.placedAt,
      orderId: o.id,
      orderNumber: o.orderNumber,
      amount: o.grandTotal,
      kind: o.fulfillmentStatus,
      text: null,
    })),
    ...enrich.payments.map<Customer360Event>((p) => ({
      type: "payment",
      at: p.at,
      orderId: p.order_id,
      orderNumber: Number(p.order_number),
      amount: Number(p.amount),
      kind: p.status,
      text: null,
    })),
    ...enrich.ledger.map<Customer360Event>((l) => ({
      type: "ledger",
      at: l.created_at,
      orderId: null,
      orderNumber: null,
      amount: Number(l.amount),
      kind: l.type,
      text: l.note,
    })),
    ...enrich.notes.map<Customer360Event>((n) => ({
      type: "note",
      at: n.created_at,
      orderId: n.order_id,
      orderNumber: Number(n.order_number),
      amount: null,
      kind: null,
      text: n.body,
    })),
    ...enrich.returns.map<Customer360Event>((r) => ({
      type: "return",
      at: r.created_at,
      orderId: r.order_id,
      orderNumber: Number(r.order_number),
      amount: Number(r.refund_amount),
      kind: r.status,
      text: r.reason,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const recencyDays = enrich.agg?.recency_days ?? null;
  const aov = base.ordersCount > 0 ? Math.round(base.totalSpent / base.ordersCount) : 0;

  return {
    ...base,
    aov,
    lastOrderAt: enrich.agg?.last_order_at ?? null,
    recencyDays,
    rfmSegment: rfmSegment(base.ordersCount, base.totalSpent, recencyDays),
    ledgerBalance: Number(enrich.ledger[0]?.balance ?? 0),
    timeline: events.slice(0, 80),
  };
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
