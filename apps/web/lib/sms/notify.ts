// Post-commit order notifications (blueprint Notifications 1.9). Fires the
// customer confirmation + seller alert AFTER the order transaction commits.
//
// NON-BLOCKING by contract: a gateway failure here must never roll back an
// order that already committed, and must never surface as a checkout error to
// the buyer. Every send is caught and logged; the function always resolves.
import { getSmsAdapter } from "./index";
import {
  customerOrderConfirmationSms,
  sellerNewOrderAlertSms,
  customerOrderStatusSms,
  marketplaceBuyerOrderConfirmationSms,
  type OrderNotificationData,
  type OrderStatusNotificationData,
  type StatusChangeKind,
  type MarketplaceOrderConfirmationData,
} from "./templates";
import { notifyOrderPlacedWhatsApp } from "@/lib/whatsapp/notify";

export interface SendOrderNotificationsInput extends OrderNotificationData {
  /** Seller hotline to alert. Null/absent → skip the seller SMS. */
  sellerPhone: string | null;
  /**
   * Tenant id, used ONLY to fire the additive, per-tenant-opt-in WhatsApp
   * confirmation alongside SMS. Optional so existing callers stay valid;
   * absent → WhatsApp is skipped, SMS path unchanged.
   */
  tenantId?: string;
}

// Fire-and-await both messages, swallowing per-message errors. Awaited (not
// detached) so a serverless invocation doesn't terminate mid-send, but failures
// are isolated: one send failing never blocks the other or the caller.
export async function sendOrderNotifications(
  input: SendOrderNotificationsInput,
): Promise<void> {
  const sms = getSmsAdapter();

  await safeSend(() =>
    sms.send(input.customerPhone, customerOrderConfirmationSms(input)),
    `customer ${input.customerPhone} order #${input.orderNumber}`,
  );

  if (input.sellerPhone) {
    await safeSend(() =>
      sms.send(input.sellerPhone!, sellerNewOrderAlertSms(input)),
      `seller ${input.sellerPhone} order #${input.orderNumber}`,
    );
  }

  // WhatsApp customer confirmation — ADDITIVE to SMS, per-tenant opt-in,
  // self-contained non-blocking (notifyOrderPlacedWhatsApp swallows its own
  // errors). Skipped when no tenantId is supplied. Never affects the SMS path.
  if (input.tenantId) {
    await notifyOrderPlacedWhatsApp({
      tenantId: input.tenantId,
      storeName: input.storeName,
      orderNumber: input.orderNumber,
      total: input.total,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
    });
  }
}

async function safeSend(
  send: () => Promise<{ ok: boolean }>,
  context: string,
): Promise<void> {
  try {
    const result = await send();
    if (!result.ok) {
      console.warn(`[sms] send returned not-ok (${context})`);
    }
  } catch (error) {
    console.error(`[sms] send failed (${context}):`, error);
  }
}

// Phase 6 — Status-change notifications (shipped / delivered / cancelled).
// Buyer-facing. Same non-blocking guarantee: a gateway failure here must never
// surface as an order-management error to the merchant.
export async function sendOrderStatusNotification(
  input: OrderStatusNotificationData,
  kind: StatusChangeKind,
): Promise<void> {
  const sms = getSmsAdapter();
  await safeSend(
    () => sms.send(input.customerPhone, customerOrderStatusSms(input, kind)),
    `customer ${input.customerPhone} order #${input.orderNumber} status=${kind}`,
  );
}

// Marketplace buyer confirmation — fires once after the saga finalises at
// least one successful sub-order. Non-blocking: failures are swallowed; the
// checkout has already committed.
export async function sendMarketplaceBuyerConfirmation(
  phone: string,
  data: MarketplaceOrderConfirmationData,
): Promise<void> {
  const sms = getSmsAdapter();
  await safeSend(
    () => sms.send(phone, marketplaceBuyerOrderConfirmationSms(data)),
    `marketplace buyer ${phone} (${data.vendorCount} vendors ৳${data.grandTotal})`,
  );
}
