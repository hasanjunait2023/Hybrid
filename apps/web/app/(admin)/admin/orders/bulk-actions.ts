"use server";

// Bulk order ops (tenant roadmap P1 #3) — the daily morning batch workflow:
// confirm N orders, then push N to the courier in one go. Each order is its own
// transaction so one bad order (invalid transition, already shipped) never
// blocks the rest — partial success is reported back. Auth + RLS identical to
// the single-order actions; the transition rules are reused verbatim.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { bulkAdvanceStatusCore, type FulfillmentStatus } from "@/lib/admin/orders";
import { getSteadfastProvider, readSteadfastCreds } from "@/lib/couriers/steadfast";
import { getPathaoProvider, readPathaoCreds } from "@/lib/couriers/pathao";
import { sendToCourierCore, resolveCourierBinding } from "@/lib/couriers/send";

export interface BulkResult {
  ok: boolean;
  succeeded: number;
  failed: { id: string; reason: string }[];
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

const IdsSchema = z.array(z.string().uuid()).min(1).max(200);
const ToSchema = z.enum(["confirmed", "packed", "shipped", "delivered", "cancelled"]);

// Advance many orders to one target status. Skips any order the transition rules
// reject (reported in `failed`), so a mixed-status selection is safe to batch.
export async function bulkAdvanceStatus(orderIds: string[], to: string): Promise<BulkResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, succeeded: 0, failed: [], error: auth.error };
  const ids = IdsSchema.safeParse(orderIds);
  const target = ToSchema.safeParse(to);
  if (!ids.success || !target.success) {
    return { ok: false, succeeded: 0, failed: [], error: "অবৈধ অনুরোধ।" };
  }

  const res = await bulkAdvanceStatusCore(
    auth.tenantId,
    auth.userId,
    ids.data,
    target.data as FulfillmentStatus,
  );

  for (const id of ids.data) revalidateTag(`tenant:${auth.tenantId}:order:${id}`);
  revalidateTag(`tenant:${auth.tenantId}:orders`);
  revalidateTag(`tenant:${auth.tenantId}:dashboard`);
  revalidateTag(`tenant:${auth.tenantId}:products`);
  return { ok: true, succeeded: res.succeeded, failed: res.failed };
}

// Push many orders to the tenant's enabled courier. Resolves the courier binding
// once, then creates a consignment per order; the double-send guard in the core
// makes already-sent orders fail cleanly into `failed` rather than duplicating.
export async function bulkSendToCourier(orderIds: string[]): Promise<BulkResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, succeeded: 0, failed: [], error: auth.error };
  const ids = IdsSchema.safeParse(orderIds);
  if (!ids.success) return { ok: false, succeeded: 0, failed: [], error: "অবৈধ অনুরোধ।" };

  const binding = await resolveCourierBinding(auth.tenantId, auth.userId, {
    steadfast: () => ({
      providerName: "steadfast",
      adapter: getSteadfastProvider(),
      readCreds: readSteadfastCreds,
    }),
    pathao: () => ({
      providerName: "pathao",
      adapter: getPathaoProvider(auth.tenantId),
      readCreds: readPathaoCreds,
    }),
  });
  if (!binding) {
    return { ok: false, succeeded: 0, failed: [], error: "প্রথমে সেটিংসে কুরিয়ার সংযোগ করুন।" };
  }

  const failed: { id: string; reason: string }[] = [];
  let succeeded = 0;

  for (const orderId of ids.data) {
    const res = await sendToCourierCore(
      auth.tenantId,
      auth.userId,
      orderId,
      binding.adapter,
      binding.readCreds,
      { providerName: binding.providerName },
    );
    if (res.ok) {
      succeeded += 1;
      revalidateTag(`tenant:${auth.tenantId}:order:${orderId}`);
    } else {
      failed.push({ id: orderId, reason: res.error ?? "ব্যর্থ" });
    }
  }

  revalidateTag(`tenant:${auth.tenantId}:orders`);
  revalidateTag(`tenant:${auth.tenantId}:cod`);
  revalidateTag(`tenant:${auth.tenantId}:dashboard`);
  return { ok: true, succeeded, failed };
}

// Bulk cancel — marks many orders as cancelled and restores inventory. Delegates
// to bulkAdvanceStatusCore (which already handles cancel + restore-inventory).
export async function bulkCancel(orderIds: string[]): Promise<BulkResult> {
  return bulkAdvanceStatus(orderIds, "cancelled");
}

// Bulk print — returns the list of order IDs that have a printable invoice
// page. The client opens each print URL in a new tab so the browser handles
// pagination/print dialog. Returns the URLs so the client can fall back to a
// single combined window if popups are blocked.
export async function bulkPrintInvoices(orderIds: string[]): Promise<BulkResult & { urls: string[] }> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, succeeded: 0, failed: [], error: auth.error, urls: [] };
  const ids = IdsSchema.safeParse(orderIds);
  if (!ids.success) {
    return { ok: false, succeeded: 0, failed: [], error: "অবৈধ অনুরোধ।", urls: [] };
  }
  // All orders are printable — the print page exists for every order. Return
  // absolute URLs the client can open in new tabs.
  const urls = ids.data.map((id) => `/admin/orders/${id}/print`);
  revalidateTag(`tenant:${auth.tenantId}:orders`);
  return { ok: true, succeeded: urls.length, failed: [], urls };
}
