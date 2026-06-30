// Shared commerce core — THE idempotent place-order transaction
// (blueprint "apps/web shared cores" → lib/commerce/placeOrder.ts;
//  research brief §4 idempotent checkout).
//
// Storefront checkout AND admin manual entry both call placeOrder(). Everything
// runs inside ONE withTenant(tenantId, userId, tx => ...) transaction so the
// whole order — customer, address, inventory decrement, orders row, items and
// payment — commits or rolls back atomically. RLS context is set by withTenant.
//
// Invariants honored here (blueprint "Sacred invariants"):
//   * Atomic inventory decrement (UPDATE ... WHERE inventory_quantity >= qty)
//     is the oversell guard — a tracked variant returning 0 rows throws
//     INSUFFICIENT_STOCK and rolls back the whole txn.
//   * Server-side prices ONLY — unit_price is read from product_variant; any
//     client-supplied price is ignored.
//   * payment.id is the idempotency key (= bKash merchantInvoiceNumber). The
//     bKash create-payment API call + webhook are done by the CHECKOUT slice
//     AFTER this commits; here we just set status 'pending' and return
//     bkashRequired so the caller knows to kick off the popup flow.
import { randomUUID } from "node:crypto";
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { upsertCustomerByPhone } from "./customer";
import { computeSlaForOrder } from "@/lib/sla/compute";
import { computeCancelAfterAt } from "@/lib/orders/autoCancel";

// 'hybridpay' is Hybrid's single white-labeled online gateway (subsumes the
// individual MFS gateways — bKash/Nagad are methods INSIDE Hybrid Pay, not
// separate Hybrid options). 'bkash' is kept as a still-functional legacy path.
// All three map 1:1 to a payment_provider enum value (payment.provider below).
export type PaymentMethod = "cod" | "bkash" | "hybridpay";
// Mirrors the `order_source` Postgres enum (01_schema.sql) exactly. Kept in
// sync with the DB so callers (admin manual/messenger entry, landing pages, API)
// don't need `as` casts to satisfy the type.
export type OrderSource =
  | "storefront"
  | "manual"
  | "landing_page"
  | "messenger"
  | "api";
// Sales channel. 'storefront' = the tenant's own store (default, unchanged).
// 'marketplace' = a sub-order created by the cross-vendor bazaar checkout.
export type OrderChannel = "storefront" | "marketplace";

export interface PlaceOrderCustomer {
  phone: string;
  name: string;
  email?: string | null;
}

export interface PlaceOrderShippingAddress {
  recipient: string;
  phone: string;
  division: string;
  district: string;
  thana: string;
  line: string;
}

export interface PlaceOrderItem {
  variantId: string;
  quantity: number;
  /**
   * Ignored for pricing. The unit price is ALWAYS read from product_variant.
   * Accepted only so callers (cart payloads) can pass their object through
   * unchanged; never trusted.
   */
  price?: number;
}

export interface PlaceOrderInput {
  tenantId: string;
  userId: string | null;
  customer: PlaceOrderCustomer;
  shippingAddress: PlaceOrderShippingAddress;
  items: PlaceOrderItem[];
  paymentMethod: PaymentMethod;
  note?: string | null;
  source: OrderSource;
  /**
   * Sales channel (default 'storefront'). The marketplace split-cart orchestrator
   * passes 'marketplace' so the vendor's order is tagged without changing the
   * order_source enum or existing source-keyed reports.
   */
  channel?: OrderChannel;
  /**
   * Parent marketplace_order id when this order is one leg of a split cart. A
   * VALUE link only (no hard FK across the RLS boundary). Null for normal orders.
   */
  marketplaceOrderId?: string | null;
  /** Optional flat shipping charge (BDT). P1 has no shipping calculator. */
  shippingTotal?: number;
  /**
   * Optional discount code (Phase 2.4). Server-authoritative: the client sends
   * ONLY the code; the amount is computed here from the locked discount row.
   * Null/undefined/blank → no discount.
   */
  discountCode?: string | null;
  /**
   * Order mode for wholesale B2B. 'wholesale' tags the order_mode column so the
   * wholesale order lists and platform GMV analytics count it. Defaults to retail.
   */
  orderMode?: "storefront" | "wholesale";
  /**
   * B2B credit sale (pay-later). When true the grand total is checked against the
   * customer's credit limit, recorded as credit_due on the order, and posted to
   * customer_ledger as a 'sale' entry that raises the customer's current_due.
   * Independent of paymentMethod — a credit order carries a 'cod' payment row as a
   * deferred-collection placeholder but sets cod_amount = 0 (collected via ledger,
   * not on delivery).
   */
  creditSale?: boolean;
  /** Optional preferred delivery date (ISO date string, e.g. "2026-07-05"). */
  deliveryDate?: string | null;
  /** Optional preferred time window (free-text, e.g. "10:00-13:00"). */
  deliveryTimeSlot?: string | null;
  /** Optional in-store pickup. When set, fulfillment_method = 'pickup'. */
  fulfillmentMethod?: "delivery" | "pickup";
  /** Store name / address for pickup (required when fulfillmentMethod = 'pickup'). */
  pickupLocation?: string | null;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: number;
  paymentId: string;
  /** true for bkash → checkout slice runs BkashProvider.createPayment next. */
  bkashRequired: boolean;
  /**
   * true for any non-COD (online, redirect-based) method — bkash OR hybridpay.
   * The checkout slice runs the gateway create + redirect when this is set.
   */
  onlineRequired: boolean;
  /** Applied discount (Phase 2.4), or null when no code was applied. */
  discount: AppliedDiscount | null;
  /**
   * Shared purchase-event dedup key (UUID v4, Phase 2.7). Minted here so the
   * server CAPI/GA4-MP fire and the client Pixel/gtag fire use the SAME id. Also
   * persisted to payment.payload.analytics.eventId for audit + success-page read.
   */
  analyticsEventId: string;
}

/** Server-computed discount applied to an order (Phase 2.4). */
export interface AppliedDiscount {
  code: string;
  /** Amount subtracted from the order total (BDT, never negative). */
  amount: number;
}

// Thrown (and rolled back) when a passed discount code cannot be applied. The
// reason maps to a friendly Bengali message at the checkout boundary. The whole
// txn rolls back, so used_count is never incremented for a rejected code.
export type DiscountErrorReason =
  | "DISCOUNT_INVALID" // unknown / inactive / outside window / global limit hit
  | "DISCOUNT_BELOW_MINIMUM" // subtotal < min_subtotal
  | "DISCOUNT_USAGE_LIMIT" // per-customer limit reached
  | "DISCOUNT_NOT_APPLICABLE"; // applies_to scope matched no line item

export class DiscountError extends Error {
  readonly reason: DiscountErrorReason;
  constructor(reason: DiscountErrorReason) {
    super(reason);
    this.name = "DiscountError";
    this.reason = reason;
  }
}

// Thrown (and rolled back) when a tracked variant lacks the requested quantity.
// Shape `INSUFFICIENT_STOCK:${variantId}` so the checkout/manual UI can map it
// back to the offending line.
export class InsufficientStockError extends Error {
  readonly variantId: string;
  constructor(variantId: string) {
    super(`INSUFFICIENT_STOCK:${variantId}`);
    this.name = "InsufficientStockError";
    this.variantId = variantId;
  }
}

// Thrown (and rolled back) when a wholesale order exceeds the customer's
// credit limit and payment is not COD.
export class CreditLimitExceededError extends Error {
  readonly currentDue: number;
  readonly orderTotal: number;
  readonly creditLimit: number;
  constructor(currentDue: number, orderTotal: number, creditLimit: number) {
    super(
      `CREDIT_LIMIT_EXCEEDED: current_due=${currentDue}, order_total=${orderTotal}, credit_limit=${creditLimit}`,
    );
    this.name = "CreditLimitExceededError";
    this.currentDue = currentDue;
    this.orderTotal = orderTotal;
    this.creditLimit = creditLimit;
  }
}

interface PricedLine {
  variantId: string;
  productId: string;
  title: string;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

// Decrement inventory for ONE item and return the priced line. The UPDATE is the
// oversell guard: for a tracked variant it only matches when
// inventory_quantity >= qty, so two concurrent callers racing for the last unit
// cannot both succeed (row lock + WHERE re-check). track_inventory = false skips
// the decrement and just reads the price.
async function reserveLine(
  tx: Tx,
  tenantId: string,
  item: PlaceOrderItem,
): Promise<PricedLine> {
  const decremented = await tx<
    { id: string; price: string; product_id: string; title: string | null; sku: string | null }[]
  >`
    update product_variant
       set inventory_quantity = inventory_quantity - ${item.quantity}
     where id = ${item.variantId}
       and tenant_id = ${tenantId}
       and track_inventory = true
       and inventory_quantity >= ${item.quantity}
    returning id, price, product_id, title, sku
  `;

  if (decremented.length === 1) {
    return toPricedLine(decremented[0]!, item.quantity);
  }

  // 0 rows: either an untracked variant, a tracked variant out of stock,
  // or a preorder variant. Distinguish by reading the variant + product.
  const variant = await tx<
    {
      id: string;
      price: string;
      product_id: string;
      title: string | null;
      sku: string | null;
      track_inventory: boolean;
      preorder_enabled: boolean;
    }[]
  >`
    select pv.id, pv.price, pv.product_id, pv.title, pv.sku, pv.track_inventory,
           p.preorder_enabled
      from product_variant pv
      join product p on p.id = pv.product_id and p.tenant_id = ${tenantId}
     where pv.id = ${item.variantId} and pv.tenant_id = ${tenantId}
     limit 1
  `;

  const found = variant[0];
  if (!found) {
    // Not found (cross-tenant / bad id) → reject.
    throw new InsufficientStockError(item.variantId);
  }

  if (found.preorder_enabled) {
    // Preorder — sell without decrementing inventory.
    return toPricedLine(found, item.quantity);
  }

  if (found.track_inventory) {
    // Tracked-but-insufficient → reject.
    throw new InsufficientStockError(item.variantId);
  }

  // Untracked variant — sell without decrementing.
  return toPricedLine(found, item.quantity);
}

function toPricedLine(
  row: { id: string; price: string; product_id: string; title: string | null; sku: string | null },
  quantity: number,
): PricedLine {
  const unitPrice = Number(row.price);
  return {
    variantId: row.id,
    productId: row.product_id,
    title: row.title ?? "",
    sku: row.sku ?? null,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
  };
}

interface DiscountRow {
  id: string;
  code: string;
  type: "percentage" | "fixed_amount" | "free_shipping";
  value: string;
  min_subtotal: string;
  usage_limit: number | null;
  used_count: number;
  per_customer_limit: number | null;
  applies_to: { scope?: string; productIds?: string[]; collectionIds?: string[] } | null;
}

// Resolve, validate, and lock a discount inside the live txn (Phase 2.4). The
// row is taken FOR UPDATE so two concurrent checkouts racing the same code can't
// both pass a usage_limit < used_count check — the second blocks until the first
// commits its used_count increment, then re-reads the new value. Returns the
// computed discount (and whether it zeroes shipping); the CALLER increments
// used_count + persists. Throws DiscountError (rolls back) on any rejection.
async function applyDiscount(
  tx: Tx,
  tenantId: string,
  code: string,
  customerId: string,
  subtotal: number,
  shippingTotal: number,
  lineProductIds: string[],
): Promise<{ row: DiscountRow; amount: number; zeroesShipping: boolean }> {
  // status='active' + window check + global usage_limit, all under a row lock.
  // citext column → case-insensitive code match. now() gates the active window.
  const rows = await tx<DiscountRow[]>`
    select id, code, type, value, min_subtotal,
           usage_limit, used_count, per_customer_limit, applies_to
      from discount
     where tenant_id = ${tenantId}
       and code = ${code}
       and status = 'active'
       and (starts_at is null or starts_at <= now())
       and (ends_at   is null or ends_at   >= now())
     for update
  `;
  const row = rows[0];
  if (!row) throw new DiscountError("DISCOUNT_INVALID");

  // Global usage limit (re-checked under the lock against the freshest count).
  if (row.usage_limit !== null && row.used_count >= row.usage_limit) {
    throw new DiscountError("DISCOUNT_INVALID");
  }

  // Minimum cart value.
  if (subtotal < Number(row.min_subtotal)) {
    throw new DiscountError("DISCOUNT_BELOW_MINIMUM");
  }

  // Per-customer limit: count this customer's PRIOR orders carrying this code.
  if (row.per_customer_limit !== null) {
    const prior = await tx<{ n: string }[]>`
      select count(*)::bigint as n
        from orders
       where tenant_id = ${tenantId}
         and customer_id = ${customerId}
         and discount_code = ${row.code}
    `;
    if (Number(prior[0]?.n ?? 0) >= row.per_customer_limit) {
      throw new DiscountError("DISCOUNT_USAGE_LIMIT");
    }
  }

  // applies_to scope: 'all' (default) matches always; 'product'/'collection'
  // require at least one line item in the referenced set.
  const scope = row.applies_to?.scope ?? "all";
  if (scope === "product") {
    const ids = row.applies_to?.productIds ?? [];
    const match = lineProductIds.some((pid) => ids.includes(pid));
    if (!match) throw new DiscountError("DISCOUNT_NOT_APPLICABLE");
  } else if (scope === "collection") {
    const ids = row.applies_to?.collectionIds ?? [];
    const inScope =
      ids.length > 0 &&
      lineProductIds.length > 0 &&
      (
        await tx<{ n: string }[]>`
          select count(*)::bigint as n
            from product_collection
           where tenant_id = ${tenantId}
             and product_id in ${tx(lineProductIds)}
             and collection_id in ${tx(ids)}
        `
      );
    const n = Array.isArray(inScope) ? Number(inScope[0]?.n ?? 0) : 0;
    if (n === 0) throw new DiscountError("DISCOUNT_NOT_APPLICABLE");
  }

  // Compute the discount amount. Never exceeds subtotal; never negative.
  let amount = 0;
  let zeroesShipping = false;
  if (row.type === "percentage") {
    amount = Math.min((subtotal * Number(row.value)) / 100, subtotal);
  } else if (row.type === "fixed_amount") {
    amount = Math.min(Number(row.value), subtotal);
  } else {
    // free_shipping: requires a known (non-null) shipping charge to zero. When
    // there is no shipping line the discount is a no-op amount but still valid.
    if (shippingTotal == null) throw new DiscountError("DISCOUNT_NOT_APPLICABLE");
    zeroesShipping = true;
  }
  amount = Math.max(0, Math.round(amount * 100) / 100);
  return { row, amount, zeroesShipping };
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (input.items.length === 0) {
    throw new Error("EMPTY_ORDER");
  }

  const isCod = input.paymentMethod === "cod";
  const shippingTotal = input.shippingTotal ?? 0;
  const discountCode = input.discountCode?.trim() || null;

  return withTenant(input.tenantId, input.userId, async (tx) => {
    // (1) customer upsert by phone.
    const customerId = await upsertCustomerByPhone(tx, input.tenantId, {
      phone: input.customer.phone,
      name: input.customer.name,
      email: input.customer.email ?? null,
    });

    // (2) default shipping address upsert. One default per customer: clear the
    // old default, then write the new one. Kept simple for P1 (no address book).
    await tx`
      update customer_address
         set is_default = false
       where customer_id = ${customerId} and is_default = true
    `;
    await tx`
      insert into customer_address
        (tenant_id, customer_id, recipient_name, phone, division, district, thana, address_line, is_default)
      values
        (${input.tenantId}, ${customerId}, ${input.shippingAddress.recipient},
         ${input.shippingAddress.phone}, ${input.shippingAddress.division},
         ${input.shippingAddress.district}, ${input.shippingAddress.thana},
         ${input.shippingAddress.line}, true)
    `;

    // (3) atomic inventory decrement + server-side pricing, per item.
    const lines: PricedLine[] = [];
    for (const item of input.items) {
      lines.push(await reserveLine(tx, input.tenantId, item));
    }

    // Server-computed totals — never trust client prices.
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

    // (3b) discount (Phase 2.4). Applied AFTER subtotal is known and BEFORE the
    // orders INSERT, inside the SAME txn — the FOR UPDATE lock + the used_count
    // increment below roll back atomically with the order if anything later
    // fails. Server-authoritative: amount is computed here, never trusted from
    // the client. A blank/absent code is simply no discount.
    let appliedDiscount: AppliedDiscount | null = null;
    let discountTotal = 0;
    let effectiveShipping = shippingTotal;
    if (discountCode) {
      const result = await applyDiscount(
        tx,
        input.tenantId,
        discountCode,
        customerId,
        subtotal,
        shippingTotal,
        lines.map((l) => l.productId),
      );
      discountTotal = result.amount;
      if (result.zeroesShipping) effectiveShipping = 0;
      // Atomic, race-safe usage increment under the held lock. Re-asserts the
      // global limit in the WHERE so an exhausted code can never tip over.
      const bumped = await tx<{ id: string }[]>`
        update discount
           set used_count = used_count + 1, updated_at = now()
         where id = ${result.row.id}
           and (usage_limit is null or used_count < usage_limit)
        returning id
      `;
      if (bumped.length !== 1) throw new DiscountError("DISCOUNT_INVALID");
      appliedDiscount = { code: result.row.code, amount: discountTotal };
    }

    const grandTotal = subtotal - discountTotal + effectiveShipping;
    const isCreditSale = input.creditSale === true;
    // A credit sale is collected later via the ledger, not on delivery — so it
    // carries no COD amount even though its payment row is a 'cod' placeholder.
    const codAmount = isCod && !isCreditSale ? grandTotal : 0;
    const creditDue = isCreditSale ? grandTotal : 0;
    const orderModeValue = input.orderMode === "wholesale" ? "wholesale" : "retail";

    // (3c) Credit limit check — only genuine pay-later credit sales consume the
    // customer's credit line (COD and pay-now online orders settle immediately).
    if (isCreditSale) {
      const custRows = await tx<
        { credit_limit: string; current_due: string }[]
      >`
        select credit_limit, current_due
        from customer
        where id = ${customerId}
          and tenant_id = ${input.tenantId}
        limit 1
      `;
      const cust = custRows[0];
      if (cust) {
        const creditLimit = Number(cust.credit_limit);
        const currentDue = Number(cust.current_due);
        if (creditLimit > 0 && currentDue + grandTotal > creditLimit) {
          throw new CreditLimitExceededError(currentDue, grandTotal, creditLimit);
        }
      }
    }

    // (4) INSERT orders. order_number is assigned by the assign_order_number
    // trigger. COD is confirmed immediately; bKash stays pending until executed.
    //
    // SLA stamping (Digital Commerce Guidelines 2021): load the tenant's
    // shipping_config origin (same query the shipping calculator uses) and
    // compute deadlines from placed_at + dest. The deadlines are frozen at
    // placement so subsequent edits to the tenant's origin don't move the
    // timer. If no shipping_config exists (tenant never configured shipping)
    // we still stamp deadlines using the dest as its own "origin" → forces
    // same_city 5d deadline (conservative: never under-promise to the
    // customer). Null deadlines are also valid for non-shipping orders
    // (digital products, pickup) but placeOrder today is shipping-only.
    const slaRows = await tx<
      {
        origin_division: string | null;
        origin_district: string | null;
      }[]
    >`
      select origin_division, origin_district
      from shipping_config
      where tenant_id = ${input.tenantId}
      limit 1
    `;
    const origin = slaRows[0]
      ? {
          division: slaRows[0].origin_division,
          district: slaRows[0].origin_district,
        }
      : {
          // Tenant has no shipping_config — fall back to "dest == origin" so the
          // timer defaults to same_city 5d. Safe: never shortens the customer's
          // entitlement (the 10d out-city deadline would only help the merchant).
          division: input.shippingAddress.division,
          district: input.shippingAddress.district,
        };
    const sla = computeSlaForOrder(new Date(), origin, {
      division: input.shippingAddress.division,
      district: input.shippingAddress.district,
    });

    // (O20) Stamp cancel_after_at at placement so the sweep has a cheap
    // indexed predicate to filter on. Two values feed the calculation:
    //   * the env var AUTO_CANCEL_HOURS (default 48) — same knob the sweep reads
    //   * the local `placed_at = new Date()` below, so the deadline is
    //     deterministic and consistent across processes.
    const cancelAfterAt = computeCancelAfterAt(new Date());

    const orderRows = await tx<{ id: string; order_number: string }[]>`
      insert into orders (
        tenant_id, customer_id,
        customer_name, customer_phone, customer_email,
        shipping_address,
        subtotal, discount_total, discount_code,
        shipping_total, grand_total, cod_amount, currency,
        payment_status, fulfillment_status, source, channel, marketplace_order_id,
        order_mode, credit_due, credit_approved, note,
        sla_zone, sla_handover_deadline_at, sla_delivery_deadline_at,
        cancel_after_at,
        delivery_date, delivery_time_slot,
        fulfillment_method, pickup_location
      ) values (
        ${input.tenantId}, ${customerId},
        ${input.customer.name}, ${input.customer.phone}, ${input.customer.email ?? null},
        ${tx.json({
          recipient: input.shippingAddress.recipient,
          phone: input.shippingAddress.phone,
          division: input.shippingAddress.division,
          district: input.shippingAddress.district,
          thana: input.shippingAddress.thana,
          line: input.shippingAddress.line,
        })},
        ${subtotal}, ${discountTotal}, ${appliedDiscount?.code ?? null},
        ${effectiveShipping}, ${grandTotal}, ${codAmount}, 'BDT',
        'unpaid',
        ${isCod ? "confirmed" : "pending"},
        ${input.source}, ${input.channel ?? "storefront"}, ${input.marketplaceOrderId ?? null},
        ${orderModeValue}, ${creditDue}, ${isCreditSale},
        ${input.note ?? null},
        ${sla.zone}, ${sla.handover.toISOString()}, ${sla.delivery.toISOString()},
        ${input.cancelAfterAt?.toISOString() ?? null},
        ${input.deliveryDate ?? null}::date, ${input.deliveryTimeSlot ?? null},
        ${input.fulfillmentMethod ?? "delivery"}::fulfillment_method, ${input.pickupLocation ?? null}
      )
      returning id, order_number
    `;
    const order = orderRows[0]!;

    // (5) INSERT order_item rows — title/sku/unit_price/line_total snapshot
    // from the DB-read prices (not the client).
    for (const line of lines) {
      await tx`
        insert into order_item (
          tenant_id, order_id, product_id, variant_id,
          title, sku, unit_price, quantity, line_total
        ) values (
          ${input.tenantId}, ${order.id}, ${line.productId}, ${line.variantId},
          ${line.title}, ${line.sku}, ${line.unitPrice}, ${line.quantity}, ${line.lineTotal}
        )
      `;
    }

    // (6) INSERT payment. id = idempotency key = bKash merchantInvoiceNumber.
    // COD: provider 'cod', amount = grand_total; order stays payment_status
    // 'unpaid' with cod_amount set (collected on delivery). bKash: status
    // 'pending' — the checkout slice runs createPayment/execute after commit.
    // payload.analytics.eventId carries the shared purchase-event dedup key
    // (Phase 2.7): the success page reads it for the client Pixel eventID and the
    // server CAPI/GA4-MP fire so both sides share one id. (The bKash checkout
    // slice later merges create-payment data into the same payload jsonb.)
    const analyticsEventId = randomUUID();
    const paymentRows = await tx<{ id: string }[]>`
      insert into payment (tenant_id, order_id, provider, status, amount, payload)
      values (
        ${input.tenantId}, ${order.id}, ${input.paymentMethod},
        'pending', ${grandTotal},
        ${tx.json({ analytics: { eventId: analyticsEventId } })}
      )
      returning id
    `;
    const paymentId = paymentRows[0]!.id;

    // (7) customer counters + monthly usage_counter.
    await tx`
      update customer
         set orders_count = orders_count + 1,
             total_spent  = total_spent + ${grandTotal},
             updated_at   = now()
       where id = ${customerId}
    `;
    await tx`
      insert into usage_counter (tenant_id, period_month, orders_count)
      values (${input.tenantId}, date_trunc('month', now())::date, 1)
      on conflict (tenant_id, period_month)
        do update set orders_count = usage_counter.orders_count + 1,
                      updated_at = now()
    `;

    // (7b) Credit-sale ledger posting. A B2B credit order raises the buyer's
    // running due; a customer_ledger 'sale' row records it so the wholesale
    // ledger view and customer.current_due stay in lockstep with later payments
    // (recordPayment / issueCreditNote subtract from the same running balance).
    if (isCreditSale) {
      const lastEntry = await tx<{ balance: string }[]>`
        select balance from customer_ledger
         where customer_id = ${customerId} and tenant_id = ${input.tenantId}
         order by created_at desc
         limit 1
      `;
      const prevBalance = lastEntry[0] ? Number(lastEntry[0].balance) : 0;
      const newBalance = prevBalance + grandTotal;
      await tx`
        insert into customer_ledger
          (tenant_id, customer_id, type, amount, balance, reference_type, reference_id, note)
        values
          (${input.tenantId}, ${customerId}, 'sale', ${grandTotal}, ${newBalance},
           'order', ${order.id}, ${`অর্ডার #${order.order_number}`})
      `;
      await tx`
        update customer
           set current_due = current_due + ${grandTotal},
               updated_at = now()
         where id = ${customerId} and tenant_id = ${input.tenantId}
      `;
    }

    return {
      orderId: order.id,
      orderNumber: Number(order.order_number),
      paymentId,
      bkashRequired: input.paymentMethod === "bkash",
      onlineRequired: input.paymentMethod !== "cod",
      discount: appliedDiscount,
      analyticsEventId,
    };
  });
}
