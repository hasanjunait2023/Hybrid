// Wholesale / B2B data layer. All reads go through withTenant (RLS).
// Matches the schema in 24_wholesale.sql.
import { withTenant, asPlatformAdmin } from "@hybrid/db";

// ---------------------------------------------------------------------------
// Tenant business type
// ---------------------------------------------------------------------------
export type BusinessType = "retail" | "wholesale" | "both";

export async function getTenantBusinessType(
  tenantId: string,
): Promise<BusinessType> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ business_type: BusinessType }[]>`
      select business_type from tenant where id = ${tenantId} limit 1
    `,
  );
  return rows[0]?.business_type ?? "retail";
}

// ---------------------------------------------------------------------------
// Wholesale products
// ---------------------------------------------------------------------------
export interface WholesaleProductRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  wholesalePrice: number | null;
  moq: number | null;
  inventory: number;
  imageUrl: string | null;
  isWholesale: boolean;
  wholesaleOnly: boolean;
}

export async function listWholesaleProducts(
  tenantId: string,
  userId: string,
): Promise<WholesaleProductRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        title: string;
        slug: string;
        status: string;
        price: string | null;
        wholesale_price: string | null;
        moq: number | null;
        inventory: string | null;
        image_url: string | null;
        is_wholesale: boolean;
        wholesale_only: boolean;
      }[]
    >`
      select
        p.id, p.title, p.slug, p.status,
        (select min(v.price) from product_variant v where v.product_id = p.id) as price,
        (select min(v.wholesale_price) from product_variant v where v.product_id = p.id) as wholesale_price,
        coalesce(p.moq, (select min(v.moq) from product_variant v where v.product_id = p.id)) as moq,
        (select coalesce(sum(v.inventory_quantity), 0)::int from product_variant v where v.product_id = p.id) as inventory,
        (select i.url from product_image i where i.product_id = p.id order by i.position asc limit 1) as image_url,
        p.is_wholesale, p.wholesale_only
      from product p
      where p.is_wholesale = true
      order by p.created_at desc
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    price: r.price != null ? Number(r.price) : 0,
    wholesalePrice: r.wholesale_price != null ? Number(r.wholesale_price) : null,
    moq: r.moq,
    inventory: r.inventory != null ? Number(r.inventory) : 0,
    imageUrl: r.image_url,
    isWholesale: r.is_wholesale,
    wholesaleOnly: r.wholesale_only,
  }));
}

export interface WholesaleProductStats {
  total: number;
  active: number;
}

export async function getWholesaleProductStats(
  tenantId: string,
  userId: string,
): Promise<WholesaleProductStats> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ total: number; active: number }[]>`
      select
        count(*)::int as total,
        count(*) filter (where status = 'active')::int as active
      from product
      where is_wholesale = true
    `,
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    active: r?.active ?? 0,
  };
}

// ---------------------------------------------------------------------------
// B2B customers
// ---------------------------------------------------------------------------
export interface B2BCustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  businessName: string | null;
  customerType: string;
  creditLimit: number;
  currentDue: number;
  isVerified: boolean;
  ordersCount: number;
  totalSpent: number;
}

export async function listB2BCustomers(
  tenantId: string,
  userId: string,
): Promise<B2BCustomerRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        name: string | null;
        phone: string | null;
        business_name: string | null;
        customer_type: string;
        credit_limit: string;
        current_due: string;
        is_verified: boolean;
        orders_count: number;
        total_spent: string;
      }[]
    >`
      select
        c.id, c.name, c.phone, c.business_name, c.customer_type,
        c.credit_limit, c.current_due, c.is_verified,
        c.orders_count, c.total_spent
      from customer c
      where c.customer_type != 'end_consumer'
      order by c.created_at desc
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    businessName: r.business_name,
    customerType: r.customer_type,
    creditLimit: Number(r.credit_limit),
    currentDue: Number(r.current_due),
    isVerified: r.is_verified,
    ordersCount: r.orders_count,
    totalSpent: Number(r.total_spent),
  }));
}

export interface B2BCustomerStats {
  total: number;
  verified: number;
  totalCreditLimit: number;
  totalDue: number;
}

export async function getB2BCustomerStats(
  tenantId: string,
  userId: string,
): Promise<B2BCustomerStats> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ total: number; verified: number; credit_limit: string; current_due: string }[]>`
      select
        count(*)::int as total,
        count(*) filter (where is_verified = true)::int as verified,
        coalesce(sum(credit_limit), 0) as credit_limit,
        coalesce(sum(current_due), 0) as current_due
      from customer
      where customer_type != 'end_consumer'
    `,
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    verified: r?.verified ?? 0,
    totalCreditLimit: Number(r?.credit_limit ?? 0),
    totalDue: Number(r?.current_due ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Wholesale orders
// ---------------------------------------------------------------------------
export interface WholesaleOrderRow {
  id: string;
  orderNumber: number;
  customerName: string | null;
  customerPhone: string | null;
  grandTotal: number;
  fulfillmentStatus: string;
  paymentStatus: string;
  placedAt: string;
  poReference: string | null;
  creditApproved: boolean;
  creditDue: number;
}

export async function listWholesaleOrders(
  tenantId: string,
  userId: string,
): Promise<WholesaleOrderRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        order_number: string;
        customer_name: string | null;
        customer_phone: string | null;
        grand_total: string;
        fulfillment_status: string;
        payment_status: string;
        placed_at: string;
        po_reference: string | null;
        credit_approved: boolean;
        credit_due: string;
      }[]
    >`
      select
        o.id, o.order_number, o.customer_name, o.customer_phone,
        o.grand_total, o.fulfillment_status, o.payment_status,
        o.placed_at, o.po_reference, o.credit_approved, o.credit_due
      from orders o
      where o.order_mode = 'wholesale'
      order by o.placed_at desc
    `,
  );

  return rows.map((r) => ({
    id: r.id,
    orderNumber: Number(r.order_number),
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    grandTotal: Number(r.grand_total),
    fulfillmentStatus: r.fulfillment_status,
    paymentStatus: r.payment_status,
    placedAt: r.placed_at,
    poReference: r.po_reference,
    creditApproved: r.credit_approved,
    creditDue: Number(r.credit_due),
  }));
}

export interface WholesaleOrderCounts {
  all: number;
  pending: number;
  confirmed: number;
  shipped: number;
  delivered: number;
}

export async function getWholesaleOrderCounts(
  tenantId: string,
  userId: string,
): Promise<WholesaleOrderCounts> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ all: number; pending: number; confirmed: number; shipped: number; delivered: number }[]>`
      select
        count(*)::int as all,
        count(*) filter (where fulfillment_status = 'pending')::int as pending,
        count(*) filter (where fulfillment_status = 'confirmed')::int as confirmed,
        count(*) filter (where fulfillment_status = 'shipped')::int as shipped,
        count(*) filter (where fulfillment_status = 'delivered')::int as delivered
      from orders
      where order_mode = 'wholesale'
    `,
  );
  const r = rows[0];
  return {
    all: r?.all ?? 0,
    pending: r?.pending ?? 0,
    confirmed: r?.confirmed ?? 0,
    shipped: r?.shipped ?? 0,
    delivered: r?.delivered ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Customer ledger
// ---------------------------------------------------------------------------
export interface LedgerEntry {
  id: string;
  customerId: string;
  customerName: string | null;
  type: string;
  amount: number;
  balance: number;
  referenceType: string | null;
  note: string | null;
  createdAt: string;
}

export async function listLedgerEntries(
  tenantId: string,
  userId: string,
  customerId?: string,
): Promise<LedgerEntry[]> {
  const rows = await withTenant(tenantId, userId, (tx) => {
    if (customerId) {
      return tx<
        {
          id: string;
          customer_id: string;
          customer_name: string | null;
          type: string;
          amount: string;
          balance: string;
          reference_type: string | null;
          note: string | null;
          created_at: string;
        }[]
      >`
        select
          cl.id, cl.customer_id, c.name as customer_name,
          cl.type, cl.amount, cl.balance,
          cl.reference_type, cl.note, cl.created_at
        from customer_ledger cl
        left join customer c on c.id = cl.customer_id
        where cl.customer_id = ${customerId}
        order by cl.created_at desc
        limit 200
      `;
    }
    return tx<
      {
        id: string;
        customer_id: string;
        customer_name: string | null;
        type: string;
        amount: string;
        balance: string;
        reference_type: string | null;
        note: string | null;
        created_at: string;
      }[]
    >`
      select
        cl.id, cl.customer_id, c.name as customer_name,
        cl.type, cl.amount, cl.balance,
        cl.reference_type, cl.note, cl.created_at
      from customer_ledger cl
      left join customer c on c.id = cl.customer_id
      order by cl.created_at desc
      limit 200
    `;
  });

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    type: r.type,
    amount: Number(r.amount),
    balance: Number(r.balance),
    referenceType: r.reference_type,
    note: r.note,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Purchase requests
// ---------------------------------------------------------------------------
export interface PurchaseRequestRow {
  id: string;
  prNumber: number;
  buyerCustomerId: string;
  buyerName: string | null;
  buyerPhone: string | null;
  businessName: string | null;
  tradeLicenseNo: string | null;
  status: string;
  items: unknown;
  itemsCount: number;
  quotedSubtotal: number | null;
  quotedTotal: number | null;
  expiresAt: string | null;
  convertedOrderId: string | null;
  createdAt: string;
}

export async function listPurchaseRequests(
  tenantId: string,
  userId: string,
  statusFilter?: string,
): Promise<PurchaseRequestRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) => {
    if (statusFilter && statusFilter !== "all") {
      return tx<
        {
          id: string;
          pr_number: string;
          buyer_customer_id: string;
          buyer_name: string | null;
          buyer_phone: string | null;
          business_name: string | null;
          trade_license_no: string | null;
          status: string;
          items: unknown;
          quoted_subtotal: string | null;
          quoted_total: string | null;
          expires_at: string | null;
          converted_order_id: string | null;
          created_at: string;
        }[]
      >`
        select
          pr.id, pr.pr_number, pr.buyer_customer_id,
          c.name as buyer_name, c.phone as buyer_phone,
          c.business_name, c.trade_license_no,
          pr.status, pr.items,
          pr.quoted_subtotal, pr.quoted_total,
          pr.expires_at, pr.converted_order_id, pr.created_at
        from purchase_request pr
        left join customer c on c.id = pr.buyer_customer_id
        where pr.tenant_id = ${tenantId}
          and pr.status = ${statusFilter}
        order by pr.created_at desc
      `;
    }
    return tx<
      {
        id: string;
        pr_number: string;
        buyer_customer_id: string;
        buyer_name: string | null;
        buyer_phone: string | null;
        business_name: string | null;
        trade_license_no: string | null;
        status: string;
        items: unknown;
        quoted_subtotal: string | null;
        quoted_total: string | null;
        expires_at: string | null;
        converted_order_id: string | null;
        created_at: string;
      }[]
    >`
      select
        pr.id, pr.pr_number, pr.buyer_customer_id,
        c.name as buyer_name, c.phone as buyer_phone,
        c.business_name, c.trade_license_no,
        pr.status, pr.items,
        pr.quoted_subtotal, pr.quoted_total,
        pr.expires_at, pr.converted_order_id, pr.created_at
      from purchase_request pr
      left join customer c on c.id = pr.buyer_customer_id
      where pr.tenant_id = ${tenantId}
      order by pr.created_at desc
    `;
  });

  return rows.map((r) => ({
    id: r.id,
    prNumber: Number(r.pr_number),
    buyerCustomerId: r.buyer_customer_id,
    buyerName: r.buyer_name,
    buyerPhone: r.buyer_phone,
    businessName: r.business_name,
    tradeLicenseNo: r.trade_license_no,
    status: r.status,
    items: r.items,
    itemsCount: Array.isArray(r.items) ? r.items.length : 0,
    quotedSubtotal: r.quoted_subtotal != null ? Number(r.quoted_subtotal) : null,
    quotedTotal: r.quoted_total != null ? Number(r.quoted_total) : null,
    expiresAt: r.expires_at,
    convertedOrderId: r.converted_order_id,
    createdAt: r.created_at,
  }));
}

export async function getPurchaseRequest(
  tenantId: string,
  userId: string,
  prId: string,
): Promise<PurchaseRequestRow | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        pr_number: string;
        buyer_customer_id: string;
        buyer_name: string | null;
        buyer_phone: string | null;
        business_name: string | null;
        trade_license_no: string | null;
        status: string;
        items: unknown;
        quoted_subtotal: string | null;
        quoted_total: string | null;
        expires_at: string | null;
        converted_order_id: string | null;
        created_at: string;
      }[]
    >`
      select
        pr.id, pr.pr_number, pr.buyer_customer_id,
        c.name as buyer_name, c.phone as buyer_phone,
        c.business_name, c.trade_license_no,
        pr.status, pr.items,
        pr.quoted_subtotal, pr.quoted_total,
        pr.expires_at, pr.converted_order_id, pr.created_at
      from purchase_request pr
      left join customer c on c.id = pr.buyer_customer_id
      where pr.id = ${prId}
        and pr.tenant_id = ${tenantId}
      limit 1
    `,
  );

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    prNumber: Number(r.pr_number),
    buyerCustomerId: r.buyer_customer_id,
    buyerName: r.buyer_name,
    buyerPhone: r.buyer_phone,
    businessName: r.business_name,
    tradeLicenseNo: r.trade_license_no,
    status: r.status,
    items: r.items,
    itemsCount: Array.isArray(r.items) ? r.items.length : 0,
    quotedSubtotal: r.quoted_subtotal != null ? Number(r.quoted_subtotal) : null,
    quotedTotal: r.quoted_total != null ? Number(r.quoted_total) : null,
    expiresAt: r.expires_at,
    convertedOrderId: r.converted_order_id,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Wholesale settings (defaults stored on tenant)
// ---------------------------------------------------------------------------
export interface WholesaleSettings {
  taxRate: number;
  paymentTerms: string;
  deliveryDays: number;
  minOrderAmount: number;
}

export async function getWholesaleSettings(
  tenantId: string,
  userId: string,
): Promise<WholesaleSettings> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        wholesale_settings: {
          tax_rate?: number;
          payment_terms?: string;
          delivery_days?: number;
          min_order_amount?: number;
        } | null;
      }[]
    >`
      select wholesale_settings from tenant where id = ${tenantId} limit 1
    `,
  );
  const s = rows[0]?.wholesale_settings ?? {};
  return {
    taxRate: s.tax_rate ?? 0,
    paymentTerms: s.payment_terms ?? "due_on_delivery",
    deliveryDays: s.delivery_days ?? 7,
    minOrderAmount: s.min_order_amount ?? 0,
  };
}
