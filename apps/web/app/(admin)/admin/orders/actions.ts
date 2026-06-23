"use server";

// Orders Server Actions (blueprint S-ORDERS 1.3).
//   * updateOrderStatus — server-validated fulfillment transition; cancel
//     restores inventory (atomic, inside the same withTenant txn).
//   * createManualOrder — the F-commerce fast-lane (DESIGN §P3.4): calls the
//     shared placeOrder with source:'manual'.
//   * lookupCustomer — phone → prefill for the manual form.
// Every action authenticates (getSession) and authorizes (membership → tenant);
// mutations revalidate tenant:{id}:orders / :order:{id} / :dashboard /
// :customers / :products.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { canTransition, restoreInventory } from "@/lib/admin/orders";
import { findCustomerByPhone, type CustomerPrefill } from "@/lib/admin/customers";
import { placeOrder, InsufficientStockError } from "@/lib/commerce/placeOrder";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function bustOrderTags(tenantId: string, orderId?: string): void {
  revalidateTag(`tenant:${tenantId}:orders`);
  revalidateTag(`tenant:${tenantId}:dashboard`);
  if (orderId) revalidateTag(`tenant:${tenantId}:order:${orderId}`);
}

// ---- Status transition -----------------------------------------------------
const StatusInput = z.object({
  orderId: z.string().uuid(),
  to: z.enum([
    "pending",
    "confirmed",
    "packed",
    "shipped",
    "in_transit",
    "delivered",
    "returned",
    "cancelled",
  ]),
});

export async function updateOrderStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = StatusInput.safeParse({
    orderId: formData.get("orderId"),
    to: formData.get("to"),
  });
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  const { orderId, to } = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ fulfillment_status: string }[]>`
        select fulfillment_status from orders where id = ${orderId} for update
      `;
      const current = rows[0]?.fulfillment_status;
      if (!current) throw new Error("ORDER_NOT_FOUND");
      // Server-validated transition — the UI offers only valid moves, but never
      // trust the client.
      if (!canTransition(current, to)) throw new Error("INVALID_TRANSITION");

      // Cancel/return restore inventory before flipping status (one atomic unit).
      if (to === "cancelled" || to === "returned") {
        await restoreInventory(tx, orderId);
      }
      await tx`
        update orders
           set fulfillment_status = ${to}::order_fulfillment_status,
               cancelled_at = ${to === "cancelled" ? new Date() : null},
               updated_at = now()
         where id = ${orderId}
      `;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_TRANSITION") {
      return { ok: false, error: "এই স্ট্যাটাসে যাওয়া যাবে না।" };
    }
    if (message === "ORDER_NOT_FOUND") {
      return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
    }
    console.error("[updateOrderStatus] failed", error);
    return { ok: false, error: "স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।" };
  }

  bustOrderTags(auth.tenantId, orderId);
  revalidateTag(`tenant:${auth.tenantId}:products`); // inventory restore may change stock
  return { ok: true };
}

// ---- Manual order entry ----------------------------------------------------
const ManualItem = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(1000),
});

const ManualOrderInput = z.object({
  phone: z.string().trim().min(6, "সঠিক ফোন নম্বর দিন").max(20),
  name: z.string().trim().min(1, "গ্রাহকের নাম দিন").max(120),
  division: z.string().trim().min(1, "বিভাগ দিন").max(60),
  district: z.string().trim().min(1, "জেলা দিন").max(60),
  thana: z.string().trim().min(1, "থানা দিন").max(60),
  line: z.string().trim().max(300).optional().default(""),
  items: z.array(ManualItem).min(1, "অন্তত একটি পণ্য যোগ করুন"),
  paymentMethod: z.enum(["cod", "bkash"]).default("cod"),
  shippingTotal: z.coerce.number().min(0).max(100000).default(0),
  note: z.string().trim().max(1000).optional().default(""),
});

export interface ManualOrderResult extends ActionResult {
  orderId?: string;
  orderNumber?: number;
}

export async function createManualOrder(
  _prev: ManualOrderResult | null,
  formData: FormData,
): Promise<ManualOrderResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = ManualOrderInput.safeParse({
    phone: formData.get("phone"),
    name: formData.get("name"),
    division: formData.get("division"),
    district: formData.get("district"),
    thana: formData.get("thana"),
    line: formData.get("line") ?? "",
    items: readJson(formData.get("items")),
    paymentMethod: formData.get("paymentMethod") ?? "cod",
    shippingTotal: formData.get("shippingTotal") ?? 0,
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    const result = await placeOrder({
      tenantId: auth.tenantId,
      userId: auth.userId,
      customer: { phone: input.phone, name: input.name },
      shippingAddress: {
        recipient: input.name,
        phone: input.phone,
        division: input.division,
        district: input.district,
        thana: input.thana,
        line: input.line,
      },
      items: input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      paymentMethod: input.paymentMethod,
      note: input.note || null,
      source: "manual",
      shippingTotal: input.shippingTotal,
    });

    bustOrderTags(auth.tenantId, result.orderId);
    revalidateTag(`tenant:${auth.tenantId}:customers`);
    revalidateTag(`tenant:${auth.tenantId}:products`);
    return { ok: true, orderId: result.orderId, orderNumber: result.orderNumber };
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, error: "একটি পণ্যের পর্যাপ্ত স্টক নেই।" };
    }
    console.error("[createManualOrder] failed", error);
    return { ok: false, error: "অর্ডার তৈরি ব্যর্থ হয়েছে।" };
  }
}

/** Phone autofill for the manual form (DESIGN §P3.4). Returns null if no match. */
export async function lookupCustomer(phone: string): Promise<CustomerPrefill | null> {
  const auth = await authTenant();
  if (!auth.ok) return null;
  return findCustomerByPhone(auth.tenantId, auth.userId, phone);
}

export interface PickerVariant {
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  price: number;
  inventory: number;
  trackInventory: boolean;
}

/** Type-ahead product/variant search for the manual order picker (DESIGN §P3.4).
 *  Matches active products by title or SKU; returns sellable variants. */
export async function searchProductsForPicker(query: string): Promise<PickerVariant[]> {
  const auth = await authTenant();
  if (!auth.ok) return [];
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;

  const rows = await withTenant(auth.tenantId, auth.userId, (tx) =>
    tx<
      {
        variant_id: string;
        product_title: string;
        variant_title: string | null;
        sku: string | null;
        price: string;
        inventory_quantity: number;
        track_inventory: boolean;
      }[]
    >`
      select v.id as variant_id, p.title as product_title, v.title as variant_title,
             v.sku, v.price, v.inventory_quantity, v.track_inventory
      from product_variant v
      join product p on p.id = v.product_id
      where v.is_active = true and p.status = 'active'
        and (p.title ilike ${like} or v.sku ilike ${like})
      order by p.title asc, v.position asc
      limit 20
    `,
  );

  return rows.map((r) => ({
    variantId: r.variant_id,
    productTitle: r.product_title,
    variantTitle: r.variant_title,
    sku: r.sku,
    price: Number(r.price),
    inventory: r.inventory_quantity,
    trackInventory: r.track_inventory,
  }));
}

function readJson(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
