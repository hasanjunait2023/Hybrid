// Post-commit WhatsApp order confirmation (blueprint 2.8 S-WHATSAPP). Fires the
// customer confirmation AFTER the order transaction commits, ADDITIVE to and
// independent of the SMS path (lib/sms/notify.ts).
//
// NON-BLOCKING by contract: a WhatsApp/Meta failure here must never roll back an
// order that already committed, and must never surface as a checkout error to
// the buyer. Per-tenant opt-in: it sends only when the tenant enabled WhatsApp
// AND pasted complete sealed credentials.
//
// Flag gate: the live Meta call only fires when WHATSAPP_ENABLED=1. Off in
// dev/test → log-only ("would send"), mirroring the SMS_LIVE pattern, so local
// runs never depend on a WABA, an approved template, or per-message billing.
import { withTenant, openCredentials, isSealed } from "@hybrid/db";
import { toBnDigits } from "@hybrid/ui";
import { WhatsAppAdapter, type WhatsAppCreds } from "./adapter";

export interface NotifyWhatsAppInput {
  tenantId: string;
  storeName: string;
  orderNumber: number;
  /** Grand total in taka (Latin number from the DB). */
  total: number;
  customerName: string;
  customerPhone: string;
}

interface WhatsAppSettingsJson {
  enabled?: boolean;
  credentials?: unknown;
}

function isLive(): boolean {
  return process.env.WHATSAPP_ENABLED === "1";
}

// Read the tenant's WhatsApp opt-in flag + sealed creds via RLS. Runs with a
// null user context (post-commit, no session) exactly like the bKash callback's
// store lookup. Returns null when not enabled or not fully configured.
async function resolveCreds(tenantId: string): Promise<WhatsAppCreds | null> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ settings: { notifications?: { whatsapp?: WhatsAppSettingsJson } } | null }[]>`
      select settings from tenant where id = ${tenantId} limit 1
    `,
  );
  const whatsapp = rows[0]?.settings?.notifications?.whatsapp;
  if (!whatsapp?.enabled || !isSealed(whatsapp.credentials)) return null;

  let creds: Record<string, string>;
  try {
    creds = openCredentials(whatsapp.credentials);
  } catch {
    // A decrypt failure must not crash the notify path; treat as not configured.
    return null;
  }
  if (!creds.wabaId || !creds.phoneNumberId || !creds.accessToken) return null;
  return {
    wabaId: creds.wabaId,
    phoneNumberId: creds.phoneNumberId,
    accessToken: creds.accessToken,
  };
}

// Fire-and-await the customer confirmation, swallowing all errors. Awaited (not
// detached) so a serverless invocation doesn't terminate mid-send, but a failure
// never blocks the caller or the order. Resolves regardless of outcome.
export async function notifyOrderPlacedWhatsApp(input: NotifyWhatsAppInput): Promise<void> {
  try {
    const creds = await resolveCreds(input.tenantId);
    if (!creds) return; // not opted in / not configured → silently skip

    const vars = {
      customerName: input.customerName,
      orderNumber: toBnDigits(input.orderNumber),
      totalBdt: `৳${toBnDigits(input.total)}`,
      storeName: input.storeName,
    };

    if (!isLive()) {
      console.warn(
        `[whatsapp] (log-only, WHATSAPP_ENABLED!=1) would send order #${input.orderNumber} to ${input.customerPhone}`,
      );
      return;
    }

    const adapter = new WhatsAppAdapter({ fetch });
    const result = await adapter.sendOrderConfirmation(input.customerPhone, vars, creds);
    if (!result.ok) {
      console.warn(`[whatsapp] send returned not-ok (order #${input.orderNumber})`);
    }
  } catch (error) {
    console.error(`[whatsapp] send failed (order #${input.orderNumber}):`, error);
  }
}
