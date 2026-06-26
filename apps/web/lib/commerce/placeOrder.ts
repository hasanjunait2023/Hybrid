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

export type PaymentMethod = "cod" | "bkash";
/**
 * Order source channel.
 * Must match the `order_source` Postgres enum in 01_schema.sql:
 *   ('storefront','manual','landing_page','messenger','api')
 * DB is the source of truth — adding a new source = migration + extending this type.
 */
export type OrderSource =
  | "storefront"
  | "manual"
  | "landing_page"
  | "messenger"
  | "api";

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
  /** Optional flat shipping charge (BDT). P1 has no shipping calculator. */
  shippingTotal?: number;
  /**
   * Optional discount code (Phase 2.4). Server-authoritative: the client sends
   * ONLY the code; the amount is computed here from the locked discount row.
   * Null/undefined/blank → no discount.
   */
  discountCode?: string | null;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: number;
  paymentId: string;
  /** true for bkash → checkout slice runs BkashProvider.createPayment next. */
  bkashRequired: boolean;
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

  // 0 rows: either an untracked variant, or a tracked variant out of stock.
  // Distinguish by reading the variant within the same tenant/txn.
  const variant = await tx<
    {
      id: string;
      price: string;
      product_id: string;
      title: string | null;
      sku: string | null;
      track_inventory: boolean;
    }[]
  >`
    select id, price, product_id, title, sku, track_inventory
      from product_variant
     where id = ${item.variantId} and tenant_id = ${tenantId}
     limit 1
  `;

  const found = variant[0];
  if (!found || found.track_inventory) {
    // Not found (cross-tenant / bad id) OR tracked-but-insufficient → reject.
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
    const codAmount = isCod ? grandTotal : 0;

    // (4) INSERT orders. order_number is assigned by the assign_order_number
    // trigger. COD is confirmed immediately; bKash stays pending until executed.
    const orderRows = await tx<{ id: string; order_number: string }[]>`
      insert into orders (
        tenant_id, customer_id,
        customer_name, customer_phone, customer_email,
        shipping_address,
        subtotal, discount_total, discount_code,
        shipping_total, grand_total, cod_amount, currency,
        payment_status, fulfillment_status, source, note
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
        ${input.source}, ${input.note ?? null}
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

    return {
      orderId: order.id,
      orderNumber: Number(order.order_number),
      paymentId,
      bkashRequired: input.paymentMethod === "bkash",
      discount: appliedDiscount,
      analyticsEventId,
    };
  });
}
