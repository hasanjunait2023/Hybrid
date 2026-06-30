// O6 — Bulk actions for the orders list (sprint 3).
//
// The UI lives in OrdersBulkTable.tsx (row checkboxes + a sticky action bar).
// This file implements the four server actions the UI calls:
//   * bulkAdvanceStatus(ids, "confirmed" | "packed")
//   * bulkSendToCourier(ids)
//   * bulkPrintInvoices(ids)
//   * bulkCancel(ids)
//
// All four return the same shape so the UI can render a uniform toast:
//   { ok, succeeded, failed: { id, reason }[], error?, urls? }
//
// Per-order failures never abort the batch. A bad order_id / network glitch /
// courier config issue becomes a per-id `failed` entry; the rest of the
// batch still proceeds. The result tally (succeeded / failed count) is what
// the admin sees in the toast.
"use server";

import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { sendToCourierCore, resolveCourierBinding, type ShipmentProvider } from "@/lib/couriers/send";
import { getSteadfastProvider, readSteadfastCreds } from "@/lib/couriers/steadfast";
import { getPathaoProvider, readPathaoCreds } from "@/lib/couriers/pathao";
import { canTransition } from "@/lib/admin/orders";
import { requireSession } from "@/lib/auth/requireSession";

export interface BulkActionResult {
  ok: boolean;
  succeeded: number;
  failed: { id: string; reason: string }[];
  urls?: string[];
  error?: string;
}

const MAX_BATCH = 100; // hard cap so a misclick on "select all 5,000" doesn't lock the cron

// O6 — bulk status advance. Walks each order through the canTransition
// guard so an already-packed order isn't double-packed, an already-shipped
// order isn't confirmed-again, etc. Re-validates inside the txn.
export async function bulkAdvanceStatus(
  orderIds: string[],
  target: "confirmed" | "packed",
): Promise<BulkActionResult> {
  const session = await requireSession();
  if (!session.tenantId) {
    return { ok: false, succeeded: 0, failed: [], error: "no tenant context" };
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { ok: true, succeeded: 0, failed: [] };
  }
  const ids = orderIds.slice(0, MAX_BATCH);
  const failed: { id: string; reason: string }[] = [];
  let succeeded = 0;

  for (const id of ids) {
    try {
      const out = await withTenant(session.tenantId, session.userId, async (tx) => {
        const rows = await tx<{ fulfillment_status: string }[]>`
          select fulfillment_status from orders where id = ${id} limit 1
        `;
        if (rows.length === 0) throw new Error("ORDER_NOT_FOUND");
        const current = rows[0]?.fulfillment_status;
        if (!current || !canTransition(current, target)) {
          throw new Error(`CANNOT_TRANSITION:${current ?? "unknown"}->${target}`);
        }
        await tx`
          update orders
             set fulfillment_status = ${target}::order_fulfillment_status,
                 updated_at = now()
           where id = ${id}
        `;
        return true;
      });
      if (out) succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      failed.push({ id, reason: msg });
    }
  }

  revalidateTag(`tenant:${session.tenantId}:orders`);
  return { ok: true, succeeded, failed };
}

// O6 — bulk send-to-courier. For each id, resolves the tenant's enabled
// courier (Steadfast default, Pathao if preferred) and creates a real
// consignment. Per-order failures (ALREADY_SHIPPED, INCOMPLETE_ADDRESS,
// courier not configured) are recorded as failed with a Bengali reason.
// The full per-send security model from lib/couriers/send.ts is preserved
// (double-send guard via shipment_consignment_uniq, RLS via withTenant).
export async function bulkSendToCourier(
  orderIds: string[],
): Promise<BulkActionResult> {
  const session = await requireSession();
  if (!session.tenantId) {
    return { ok: false, succeeded: 0, failed: [], error: "no tenant context" };
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { ok: true, succeeded: 0, failed: [] };
  }
  const ids = orderIds.slice(0, MAX_BATCH);
  const failed: { id: string; reason: string }[] = [];
  let succeeded = 0;

  for (const id of ids) {
    try {
      const binding = await resolveCourierBinding(
        session.tenantId,
        session.userId,
        {
          steadfast: () => ({
            providerName: "steadfast" as ShipmentProvider,
            adapter: getSteadfastProvider(),
            readCreds: readSteadfastCreds,
          }),
          pathao: () => ({
            providerName: "pathao" as ShipmentProvider,
            adapter: getPathaoProvider(session.tenantId!),
            readCreds: readPathaoCreds,
          }),
        },
      );
      if (!binding) {
        throw new Error("COURIER_NOT_CONFIGURED");
      }
      const result = await sendToCourierCore(
        session.tenantId,
        session.userId,
        id,
        binding.adapter,
        binding.readCreds,
        { providerName: binding.providerName },
      );
      if (!result.ok) {
        throw new Error(result.error ?? "SEND_FAILED");
      }
      succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      failed.push({ id, reason: msg });
    }
  }

  revalidateTag(`tenant:${session.tenantId}:orders`);
  revalidateTag(`tenant:${session.tenantId}:shipments`);
  return { ok: true, succeeded, failed };
}

// O6 — bulk print invoices. Returns URLs the UI opens in new tabs. We
// don't pre-render PDFs server-side (the existing print page is a
// server-rendered HTML with a print stylesheet, browser handles the
// actual PDF/print dialog). Each URL is the existing /admin/orders/[id]/print
// route — that page does its own auth check.
export async function bulkPrintInvoices(
  orderIds: string[],
): Promise<BulkActionResult> {
  const session = await requireSession();
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { ok: true, succeeded: 0, failed: [], urls: [] };
  }
  const ids = orderIds.slice(0, MAX_BATCH);
  const urls = ids.map((id) => `/admin/orders/${id}/print`);
  return { ok: true, succeeded: ids.length, failed: [], urls };
}

// O6 — bulk cancel. Uses the same canTransition guard as the single
// order cancel action: you can cancel a pending/confirmed/packed order
// but not one that has been dispatched. Inventory is restored inside
// the same txn so a 50-row cancel can't leave the warehouse under-stocked.
export async function bulkCancel(
  orderIds: string[],
): Promise<BulkActionResult> {
  const session = await requireSession();
  if (!session.tenantId) {
    return { ok: false, succeeded: 0, failed: [], error: "no tenant context" };
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { ok: true, succeeded: 0, failed: [] };
  }
  const ids = orderIds.slice(0, MAX_BATCH);
  const failed: { id: string; reason: string }[] = [];
  let succeeded = 0;

  for (const id of ids) {
    try {
      const out = await withTenant(session.tenantId, session.userId, async (tx) => {
        const rows = await tx<{ fulfillment_status: string; payment_status: string }[]>`
          select fulfillment_status, payment_status
          from orders where id = ${id} limit 1
        `;
        if (rows.length === 0) throw new Error("ORDER_NOT_FOUND");
        const current = rows[0]?.fulfillment_status;
        if (!current || !canTransition(current, "cancelled")) {
          throw new Error(`CANNOT_CANCEL:${current ?? "unknown"}`);
        }
        // Restore inventory atomically with the cancel.
        await tx`
          update product_variant v
             set inventory_quantity = v.inventory_quantity + oi.quantity,
                 updated_at = now()
            from order_item oi
           where oi.order_id = ${id}
             and oi.variant_id = v.id
             and v.track_inventory = true
        `;
        await tx`
          update orders
             set fulfillment_status = 'cancelled'::order_fulfillment_status,
                 cancel_reason = 'bulk_cancel',
                 cancelled_at = now(),
                 updated_at = now()
           where id = ${id}
        `;
        return true;
      });
      if (out) succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      failed.push({ id, reason: msg });
    }
  }

  revalidateTag(`tenant:${session.tenantId}:orders`);
  revalidateTag(`tenant:${session.tenantId}:inventory`);
  return { ok: true, succeeded, failed };
}
