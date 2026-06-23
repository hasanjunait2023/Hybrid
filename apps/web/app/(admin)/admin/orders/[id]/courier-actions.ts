"use server";

// Courier Server Action (blueprint S-COURIER-WIRE 1.8) — sendToCourier.
//
// NEW file, deliberately separate from the Wave-1 orders actions.ts (status
// machine / manual entry). It owns the one courier mutation: create a Steadfast
// consignment for an order and record the shipment. The testable core lives in
// lib/couriers/send.ts (clean imports); this file is the thin auth + revalidate
// wrapper that injects the real Steadfast provider and creds reader.
//
// Double-send is prevented by shipment_consignment_uniq (caught in the core,
// surfaced as a friendly Bengali message). Secrets are never logged.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getSteadfastProvider, readSteadfastCreds } from "@/lib/couriers/steadfast";
import { sendToCourierCore, type CourierActionResult } from "@/lib/couriers/send";

export type { CourierActionResult } from "@/lib/couriers/send";

const OrderId = z.string().uuid();

export async function sendToCourier(
  _prev: CourierActionResult | null,
  formData: FormData,
): Promise<CourierActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const parsed = OrderId.safeParse(formData.get("orderId"));
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  const orderId = parsed.data;

  const result = await sendToCourierCore(
    tenantId,
    session.userId,
    orderId,
    getSteadfastProvider(),
    readSteadfastCreds,
  );

  if (result.ok) {
    revalidateTag(`tenant:${tenantId}:orders`);
    revalidateTag(`tenant:${tenantId}:order:${orderId}`);
    revalidateTag(`tenant:${tenantId}:cod`);
    revalidateTag(`tenant:${tenantId}:dashboard`);
  }
  return result;
}
