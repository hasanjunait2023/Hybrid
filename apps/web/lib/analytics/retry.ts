// Background retry worker for failed tracking events (Hybrid Tracking V2 Phase C).
//
// Migrations 53 created:
//   - tracking_event_queue (queued failed events)
//   - tracking_event_dead_letter (final failures)
//
// This module provides:
//   - queueFailedEvent(): call from send helpers to record a failure
//   - processRetryQueue(): call from a cron / route to retry pending events
//   - a lightweight Next.js Route Handler at /api/analytics/retry that a Vercel
//     cron or external scheduler can hit.
//
// RETRY POLICY:
//   - max 5 attempts per event
//   - exponential backoff: 2^attempt minutes (2, 4, 8, 16, 32 min)
//   - after max attempts, move to dead_letter
//   - each retry re-uses the original event_id so duplicates are dropped by
//     the platform when the first attempt actually succeeded asynchronously.

import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { getAnalyticsConfig } from "./config";
import { sendMetaPurchase, sendMetaViewContent, sendMetaAddToCart, sendMetaInitiateCheckout, type MetaCreds } from "./meta-capi";
import { sendGa4Purchase, sendGa4ViewContent, sendGa4AddToCart, sendGa4InitiateCheckout, type Ga4Creds } from "./ga4";
import type { PurchasePayload } from "./events";
import type { ViewContentPayload, AddToCartPayload, InitiateCheckoutPayload } from "./funnel";

export type QueuedEventName = "purchase" | "view_content" | "add_to_cart" | "initiate_checkout" | "lead" | "complete_registration";

interface QueuedPayloadMap {
  purchase: PurchasePayload;
  view_content: ViewContentPayload;
  add_to_cart: AddToCartPayload;
  initiate_checkout: InitiateCheckoutPayload;
  lead: { eventId: string; userData?: Record<string, unknown> };
  complete_registration: { eventId: string; userData?: Record<string, unknown> };
}

interface QueueRow {
  id: string;
  tenant_id: string;
  event_name: QueuedEventName;
  payload: unknown;
  user_data: unknown;
  ga_cookie: string | null;
  attempt_count: number;
}

/** Record a failed outbound tracking event for later retry. */
export async function queueFailedEvent(
  tenantId: string,
  eventName: QueuedEventName,
  payload: QueuedPayloadMap[QueuedEventName],
  opts?: {
    userData?: Record<string, unknown>;
    gaCookie?: string | null;
  },
): Promise<void> {
  await withTenant(tenantId, null, async (tx) => {
    await tx`
          insert into tracking_event_queue
            (tenant_id, event_name, payload, user_data, ga_cookie, attempt_count, next_attempt_at, created_at)
          values (
            ${tenantId}, ${eventName},
            ${tx.json(payload as unknown as Parameters<Tx["json"]>[0])},
            ${tx.json((opts?.userData ?? {}) as Parameters<Tx["json"]>[0])},
            ${opts?.gaCookie ?? null},
            0,
            now() + interval '1 minute',
            now()
          )
        `;
  });
}

/** Retry all events whose next_attempt_at is now or in the past. Idempotent. */
export async function processRetryQueue(): Promise<{ retried: number; succeeded: number; dead: number }> {
  const rows = await withTenant("00000000-0000-0000-0000-000000000000", null, async (tx) => {
    return await tx<QueueRow[]>`
      select id, tenant_id, event_name, payload, user_data, ga_cookie, attempt_count
        from tracking_event_queue
       where next_attempt_at <= now()
       order by created_at asc
       limit 100
    `;
  });

  let retried = 0;
  let succeeded = 0;
  let dead = 0;

  for (const row of rows) {
    retried++;
    const ok = await retryOne(row);
    if (ok) {
      succeeded++;
      await removeFromQueue(row.id);
    } else {
      const nextCount = row.attempt_count + 1;
      if (nextCount >= 5) {
        dead++;
        await moveToDeadLetter(row, nextCount);
      } else {
        await reschedule(row.id, nextCount);
      }
    }
  }

  return { retried, succeeded, dead };
}

async function retryOne(row: QueueRow): Promise<boolean> {
  try {
    const config = await getAnalyticsConfig(row.tenant_id, null);
    if (!config.enabled) return false;

    const metaCreds: MetaCreds | null =
      config.fbPixelId && config.fbAccessToken
        ? { pixelId: config.fbPixelId, accessToken: config.fbAccessToken, testEventCode: config.fbTestEventCode }
        : null;
    const ga4Creds: Ga4Creds | null =
      config.ga4MeasurementId && config.ga4ApiSecret
        ? { measurementId: config.ga4MeasurementId, apiSecret: config.ga4ApiSecret }
        : null;
    if (!metaCreds && !ga4Creds) return false;

    const payload = row.payload as QueuedPayloadMap[QueueRow["event_name"]];
    const userData = (row.user_data as Record<string, unknown>) ?? {};
    const gaCookie = row.ga_cookie;

    switch (row.event_name) {
      case "purchase": {
        const p = payload as PurchasePayload;
        const results: boolean[] = [];
        if (metaCreds) results.push(await sendMetaPurchase(metaCreds, p, { tenantId: row.tenant_id, userId: (userData.external_id as string | undefined) ?? "system" }, userData));
        if (ga4Creds) results.push(await sendGa4Purchase(ga4Creds, p, gaCookie, { userId: userData.external_id as string | undefined }));
        return results.some(Boolean);
      }
      case "view_content": {
        const p = payload as ViewContentPayload;
        const results: boolean[] = [];
        if (metaCreds) results.push(await sendMetaViewContent(metaCreds, p, { tenantId: row.tenant_id, userId: (userData.external_id as string | undefined) ?? "anonymous" }, userData));
        if (ga4Creds) results.push(await sendGa4ViewContent(ga4Creds, p, gaCookie, { userId: userData.external_id as string | undefined }));
        return results.some(Boolean);
      }
      case "add_to_cart": {
        const p = payload as AddToCartPayload;
        const results: boolean[] = [];
        if (metaCreds) results.push(await sendMetaAddToCart(metaCreds, p, { tenantId: row.tenant_id, userId: (userData.external_id as string | undefined) ?? "anonymous" }, userData));
        if (ga4Creds) results.push(await sendGa4AddToCart(ga4Creds, p, gaCookie, { userId: userData.external_id as string | undefined }));
        return results.some(Boolean);
      }
      case "initiate_checkout": {
        const p = payload as InitiateCheckoutPayload;
        const results: boolean[] = [];
        if (metaCreds) results.push(await sendMetaInitiateCheckout(metaCreds, p, { tenantId: row.tenant_id, userId: (userData.external_id as string | undefined) ?? "anonymous" }, userData));
        if (ga4Creds) results.push(await sendGa4InitiateCheckout(ga4Creds, p, gaCookie, { userId: userData.external_id as string | undefined }));
        return results.some(Boolean);
      }
      default:
        return false;
    }
  } catch (error) {
    console.error(`[analytics] retryOne failed (${row.id}):`, error);
    return false;
  }
}

async function removeFromQueue(id: string): Promise<void> {
  await withTenant("00000000-0000-0000-0000-000000000000", null, async (tx) => {
    await tx`delete from tracking_event_queue where id = ${id}`;
  });
}

async function reschedule(id: string, attemptCount: number): Promise<void> {
  const minutes = Math.pow(2, attemptCount);
  await withTenant("00000000-0000-0000-0000-000000000000", null, async (tx) => {
    await tx`
      update tracking_event_queue
         set attempt_count = ${attemptCount},
             next_attempt_at = now() + ${`${minutes} minutes`}::interval,
             updated_at = now()
       where id = ${id}
    `;
  });
}

async function moveToDeadLetter(row: QueueRow, finalAttemptCount: number): Promise<void> {
  await withTenant("00000000-0000-0000-0000-000000000000", null, async (tx) => {
    await tx`
      with deleted as (
        delete from tracking_event_queue where id = ${row.id} returning *
      )
      insert into tracking_event_dead_letter
        (tenant_id, event_name, payload, user_data, ga_cookie, attempt_count, failed_at)
      select tenant_id, event_name, payload, user_data, ga_cookie, ${finalAttemptCount}, now()
        from deleted
    `;
  });
}
