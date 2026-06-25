"use server";

// Returns / RTO / Exchange Server Actions (08_returns.sql). Every action
// authenticates (getSession) and authorizes (membership → tenant), then mutates
// via the lib/admin/returns data layer (withTenant + RLS) and revalidates the
// affected cache tags. Restock/refund side effects touch inventory and the
// order, so those tags are busted too.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import {
  createReturn,
  updateReturnStatus,
  type ReturnType,
  type ReturnReason,
  type ReturnStatus,
  type RefundMethod,
} from "@/lib/admin/returns";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

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

function bustReturnTags(tenantId: string, orderId?: string): void {
  revalidateTag(`tenant:${tenantId}:returns`);
  revalidateTag(`tenant:${tenantId}:products`);
  revalidateTag(`tenant:${tenantId}:dashboard`);
  if (orderId) revalidateTag(`tenant:${tenantId}:order:${orderId}`);
}

// ---- Enums (mirror the literal unions / DB enums) --------------------------
const ReturnTypeEnum = z.enum(["return", "exchange", "rto"]);
const ReturnStatusEnum = z.enum([
  "requested",
  "approved",
  "rejected",
  "in_transit",
  "received",
  "refunded",
  "completed",
  "cancelled",
]);
const ReturnReasonEnum = z.enum([
  "wrong_item",
  "damaged",
  "size_issue",
  "not_as_described",
  "customer_refused",
  "rto_undelivered",
  "fake_order",
  "other",
]);
const RefundMethodEnum = z.enum(["bkash", "nagad", "cash", "none"]);

// ---- Create ----------------------------------------------------------------
const ReturnItemInput = z.object({
  orderItemId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(1000),
  restock: z.boolean().default(true),
});

const CreateReturnSchema = z.object({
  orderId: z.string().uuid(),
  type: ReturnTypeEnum,
  reason: ReturnReasonEnum,
  note: z.string().trim().max(1000).optional().default(""),
  items: z.array(ReturnItemInput).min(1, "অন্তত একটি পণ্য যোগ করুন"),
});

export interface CreateReturnInput {
  orderId: string;
  type: ReturnType;
  reason: ReturnReason;
  note?: string;
  items: {
    orderItemId?: string | null;
    variantId?: string | null;
    title: string;
    quantity: number;
    restock: boolean;
  }[];
}

export interface CreateReturnResult extends ActionResult {
  id?: string;
}

export async function createReturnAction(
  input: CreateReturnInput,
): Promise<CreateReturnResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = CreateReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const data = parsed.data;

  try {
    const { id } = await createReturn(auth.tenantId, auth.userId, {
      orderId: data.orderId,
      type: data.type,
      reason: data.reason,
      note: data.note || null,
      items: data.items.map((i) => ({
        orderItemId: i.orderItemId ?? null,
        variantId: i.variantId ?? null,
        title: i.title,
        quantity: i.quantity,
        restock: i.restock,
      })),
    });
    bustReturnTags(auth.tenantId, data.orderId);
    return { ok: true, id };
  } catch (error) {
    console.error("[createReturnAction] failed", error);
    return { ok: false, error: "রিটার্ন তৈরি ব্যর্থ হয়েছে।" };
  }
}

// ---- Status transition -----------------------------------------------------
const UpdateStatusSchema = z.object({
  returnId: z.string().uuid(),
  status: ReturnStatusEnum,
  refundAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  refundMethod: RefundMethodEnum.optional(),
});

export async function updateReturnStatusAction(
  returnId: string,
  status: ReturnStatus,
  opts: { refundAmount?: number; refundMethod?: RefundMethod } = {},
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = UpdateStatusSchema.safeParse({
    returnId,
    status,
    refundAmount: opts.refundAmount,
    refundMethod: opts.refundMethod,
  });
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  const data = parsed.data;

  try {
    await updateReturnStatus(auth.tenantId, auth.userId, data.returnId, data.status, {
      refundAmount: data.refundAmount,
      refundMethod: data.refundMethod,
    });
  } catch (error) {
    console.error("[updateReturnStatusAction] failed", error);
    return { ok: false, error: "স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।" };
  }

  bustReturnTags(auth.tenantId);
  return { ok: true };
}

// ---- Refund convenience ----------------------------------------------------
export async function refundReturnAction(
  returnId: string,
  amount: number,
  method: RefundMethod,
): Promise<ActionResult> {
  return updateReturnStatusAction(returnId, "refunded", {
    refundAmount: amount,
    refundMethod: method,
  });
}
