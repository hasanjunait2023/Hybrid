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
  type OrderNotificationData,
} from "./templates";

export interface SendOrderNotificationsInput extends OrderNotificationData {
  /** Seller hotline to alert. Null/absent → skip the seller SMS. */
  sellerPhone: string | null;
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
