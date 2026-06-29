"use server";

// Purchase Request Server Actions.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  listPurchaseRequests as dataList,
  getPurchaseRequest as dataGet,
} from "@/lib/admin/wholesale";
import type { PurchaseRequestRow } from "@/lib/admin/wholesale";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function bustTags(tenantId: string): void {
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:wholesale:purchase-requests`);
}

export async function listPurchaseRequests(
  statusFilter?: string,
): Promise<PurchaseRequestRow[]> {
  const auth = await authTenant();
  if (!auth.ok) return [];
  return dataList(auth.tenantId, auth.userId, statusFilter);
}

export async function getPurchaseRequest(
  prId: string,
): Promise<PurchaseRequestRow | null> {
  const auth = await authTenant();
  if (!auth.ok) return null;
  return dataGet(auth.tenantId, auth.userId, prId);
}

const SubmitQuoteSchema = z.object({
  prId: z.string().uuid(),
  quotedSubtotal: z.coerce.number().min(0),
  quotedTotal: z.coerce.number().min(0),
  expiresAt: z.string().min(1, "মেয়াদ শেষের তারিখ দিন"),
});

export async function submitQuote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = SubmitQuoteSchema.safeParse({
    prId: formData.get("prId"),
    quotedSubtotal: formData.get("quotedSubtotal") || 0,
    quotedTotal: formData.get("quotedTotal") || 0,
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await tx`
        update purchase_request
           set status = 'quoted',
               quoted_subtotal = ${input.quotedSubtotal},
               quoted_total = ${input.quotedTotal},
               expires_at = ${input.expiresAt}::timestamptz,
               updated_at = now()
         where id = ${input.prId}
           and tenant_id = ${auth.tenantId}
           and status = 'submitted'
      `;
    });
  } catch (error) {
    console.error("[submitQuote] failed", error);
    return { ok: false, error: "কোট জমা দিতে ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId);
  return { ok: true };
}

export async function acceptQuote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const prId = z.string().uuid().safeParse(formData.get("prId"));
  if (!prId.success) return { ok: false, error: "রিকোয়েস্ট পাওয়া যায়নি।" };

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await tx`
        update purchase_request
           set status = 'accepted',
               updated_at = now()
         where id = ${prId.data}
           and tenant_id = ${auth.tenantId}
           and status = 'quoted'
      `;
    });
  } catch (error) {
    console.error("[acceptQuote] failed", error);
    return { ok: false, error: "কোট গ্রহণ করতে ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId);
  return { ok: true };
}

export async function rejectQuote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const prId = z.string().uuid().safeParse(formData.get("prId"));
  if (!prId.success) return { ok: false, error: "রিকোয়েস্ট পাওয়া যায়নি।" };

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await tx`
        update purchase_request
           set status = 'rejected',
               updated_at = now()
         where id = ${prId.data}
           and tenant_id = ${auth.tenantId}
           and status = 'quoted'
      `;
    });
  } catch (error) {
    console.error("[rejectQuote] failed", error);
    return { ok: false, error: "কোট প্রত্যাখ্যান করতে ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId);
  return { ok: true };
}

export async function convertToOrder(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const prId = z.string().uuid().safeParse(formData.get("prId"));
  if (!prId.success) return { ok: false, error: "রিকোয়েস্ট পাওয়া যায়নি।" };

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      // Get the purchase request details
      const prs = await tx<
        {
          id: string;
          pr_number: string;
          buyer_customer_id: string;
          quoted_total: string | null;
          items: unknown;
        }[]
      >`
        select id, pr_number, buyer_customer_id, quoted_total, items
        from purchase_request
        where id = ${prId.data}
          and tenant_id = ${auth.tenantId}
          and status = 'accepted'
        limit 1
      `;
      const pr = prs[0];
      if (!pr) {
        throw new Error("Purchase request not found or not in accepted status");
      }

      // Get customer info
      const customers = await tx<
        { name: string | null; phone: string | null }[]
      >`
        select name, phone from customer where id = ${pr.buyer_customer_id} limit 1
      `;
      const customer = customers[0];

      // Create the order
      const poRef = `PR#${pr.pr_number}`;
      const quotedTotal = pr.quoted_total != null ? Number(pr.quoted_total) : 0;
      const items = Array.isArray(pr.items) ? pr.items : [];

      const orderRows = await tx<{ id: string; order_number: string }[]>`
        insert into orders (
          tenant_id, customer_id,
          customer_name, customer_phone,
          subtotal, grand_total, currency,
          payment_status, fulfillment_status,
          source, order_mode, is_purchase_order, po_reference,
          credit_due, note
        ) values (
          ${auth.tenantId}, ${pr.buyer_customer_id},
          ${customer?.name ?? null}, ${customer?.phone ?? null},
          ${quotedTotal}, ${quotedTotal}, 'BDT',
          'unpaid', 'pending',
          'manual', 'wholesale', true, ${poRef},
          ${quotedTotal}, ${`Converted from ${poRef}`}
        )
        returning id, order_number
      `;
      const order = orderRows[0]!;

      // Insert order items from PR items
      for (const item of items) {
        const i = item as {
          productId?: string;
          variantId?: string;
          title?: string;
          quantity?: number;
          price?: number;
        };
        await tx`
          insert into order_item (
            tenant_id, order_id, product_id, variant_id,
            title, unit_price, quantity, line_total
          ) values (
            ${auth.tenantId}, ${order.id},
            ${i.productId ?? null}, ${i.variantId ?? null},
            ${i.title ?? "Item"}, ${i.price ?? 0},
            ${i.quantity ?? 1}, ${(i.price ?? 0) * (i.quantity ?? 1)}
          )
        `;
      }

      // Update PR with converted order id and status
      await tx`
        update purchase_request
           set status = 'converted',
               converted_order_id = ${order.id},
               updated_at = now()
         where id = ${pr.id}
      `;
    });
  } catch (error) {
    console.error("[convertToOrder] failed", error);
    return { ok: false, error: "অর্ডারে রূপান্তর করতে ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId);
  redirect("/admin/wholesale/orders");
}
