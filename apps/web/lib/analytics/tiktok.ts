// TikTok Events API integration (server-only). No browser code here.
//
// Sends `CompletePayment` to TikTok's Events API with the shared event_id
// so it dedups against the browser Pixel fire.
import type { PurchasePayload } from "./events";
import { logTrackingEvent } from "./log";

const EVENTS_API = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

export interface TikTokCreds {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
}

interface LogCtx {
  tenantId: string;
  userId: string;
}

function tiktokEnabled(): boolean {
  return process.env.TIKTOK_ENABLED === "true";
}

function buildPayloadLog(payload: PurchasePayload): { orderId: string; value: number; currency: string } {
  return {
    orderId: String(payload.orderNumber),
    value: payload.value,
    currency: payload.currency,
  };
}

export async function sendTikTokEvent(
  creds: TikTokCreds,
  payload: PurchasePayload,
  logCtx?: LogCtx,
): Promise<boolean> {
  const payloadLog = buildPayloadLog(payload);
  if (!tiktokEnabled()) return false;
  if (!creds.pixelId || !creds.accessToken) return false;

  const body = {
    pixel_code: creds.pixelId,
    event: "CompletePayment",
    event_id: payload.eventId,
    timestamp: new Date().toISOString(),
    context: {
      user: {
        ip: "",
        user_agent: "",
      },
      page: {
        url: "",
      },
    },
    properties: {
      currency: payload.currency,
      value: payload.value,
      contents: payload.items.map((i) => ({
        content_id: i.id,
        content_name: i.name,
        content_type: "product",
        price: i.price,
        quantity: i.quantity,
      })),
      content_type: "product",
      order_id: String(payload.orderNumber),
    },
  };

  const url = creds.testEventCode
    ? `${EVENTS_API}?access_token=${encodeURIComponent(creds.accessToken)}&test_event_code=${encodeURIComponent(creds.testEventCode)}`
    : `${EVENTS_API}?access_token=${encodeURIComponent(creds.accessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseText = (await res.text().catch(() => "")).slice(0, 4096);
    if (logCtx) {
      await logTrackingEvent({
        tenantId: logCtx.tenantId,
        userId: logCtx.userId,
        eventId: payload.eventId,
        eventName: "CompletePayment",
        platform: "tiktok",
        source: "server",
        status: res.ok ? "sent" : "failed",
        payload: payloadLog,
        responseCode: res.status,
        responseBody: responseText,
        testEventCode: creds.testEventCode ?? null,
        externalId: payload.eventId,
      });
    }
    if (!res.ok) {
      console.warn(`[analytics] TikTok Events API returned ${res.status} (order #${payload.orderNumber})`);
      return false;
    }
    return true;
  } catch (error) {
    if (logCtx) {
      await logTrackingEvent({
        tenantId: logCtx.tenantId,
        userId: logCtx.userId,
        eventId: payload.eventId,
        eventName: "CompletePayment",
        platform: "tiktok",
        source: "server",
        status: "failed",
        payload: payloadLog,
        errorMessage: error instanceof Error ? error.message : String(error),
        externalId: payload.eventId,
      });
    }
    console.error(`[analytics] TikTok Events API send failed (order #${payload.orderNumber}):`, error);
    return false;
  }
}
