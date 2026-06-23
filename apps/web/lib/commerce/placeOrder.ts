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
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { upsertCustomerByPhone } from "./customer";

export type PaymentMethod = "cod" | "bkash";
export type OrderSource = "storefront" | "manual";

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
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: number;
  paymentId: string;
  /** true for bkash → checkout slice runs BkashProvider.createPayment next. */
  bkashRequired: boolean;
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

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (input.items.length === 0) {
    throw new Error("EMPTY_ORDER");
  }

  const isCod = input.paymentMethod === "cod";
  const shippingTotal = input.shippingTotal ?? 0;

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
    const grandTotal = subtotal + shippingTotal;
    const codAmount = isCod ? grandTotal : 0;

    // (4) INSERT orders. order_number is assigned by the assign_order_number
    // trigger. COD is confirmed immediately; bKash stays pending until executed.
    const orderRows = await tx<{ id: string; order_number: string }[]>`
      insert into orders (
        tenant_id, customer_id,
        customer_name, customer_phone, customer_email,
        shipping_address,
        subtotal, shipping_total, grand_total, cod_amount, currency,
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
        ${subtotal}, ${shippingTotal}, ${grandTotal}, ${codAmount}, 'BDT',
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
    const paymentRows = await tx<{ id: string }[]>`
      insert into payment (tenant_id, order_id, provider, status, amount)
      values (
        ${input.tenantId}, ${order.id}, ${input.paymentMethod},
        'pending', ${grandTotal}
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
    };
  });
}
