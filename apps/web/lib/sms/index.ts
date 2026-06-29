// SMS adapter for sms.net.bd (Alpha Net) — blueprint Notifications 1.9, research
// brief §6. Single responsibility: deliver one unicode (Bengali) message.
//
// Gating (blueprint): live send is behind SMS_LIVE=1. Without it the adapter is
// LOG-ONLY ("would send") so dev/test never depends on credits or a masked
// sender-id (which needs 6-7d approval). Sends are fired AFTER an order commits,
// caught + logged, and NON-blocking — an SMS failure must never roll back an
// order (see lib/sms/notify.ts).
//
// sms.net.bd contract (research §6): GET/POST https://api.sms.net.bd/sendsms
//   ?api_key&msg(unicode)&to&sender_id(optional). We POST form-encoded so the
// Bengali `msg` and api_key never sit in a URL/query log.

const SENDSMS_URL = "https://api.sms.net.bd/sendsms";

export interface SmsSendResult {
  ok: boolean;
  /** Provider message id when the gateway returns one. */
  messageId?: string;
}

export interface SmsAdapter {
  send(to: string, message: string): Promise<SmsSendResult>;
}

function isLive(): boolean {
  return process.env.SMS_LIVE === "1";
}

// sms.net.bd success envelope: { error: 0, msg: "...", data: { request_id } }.
// A non-zero `error` (or a non-200) is a failure.
interface SendSmsResponse {
  error?: number;
  msg?: string;
  data?: { request_id?: string | number };
}

class SmsNetBdAdapter implements SmsAdapter {
  async send(to: string, message: string): Promise<SmsSendResult> {
    if (!isLive()) {
      // Log-only mode — the default until a funded account + masked sender-id
      // exist. Never throws; mirrors a successful send for the caller. Outside
      // dev we must NOT log the recipient phone or message body (customer PII in
      // server logs if SMS_LIVE is ever unset/misconfigured in production).
      if (process.env.NODE_ENV === "production") {
        console.warn(`[sms] log-only mode (SMS_LIVE!=1) — send skipped`);
      } else {
        console.warn(`[sms] (log-only, SMS_LIVE!=1) would send to ${to}: ${message}`);
      }
      return { ok: true, messageId: "log-only" };
    }

    const apiKey = process.env.SMS_API_KEY;
    if (!apiKey) {
      throw new Error("SMS_API_KEY is not set (SMS_LIVE=1 requires it)");
    }

    const body = new URLSearchParams({ api_key: apiKey, to, msg: message });
    const senderId = process.env.SMS_SENDER_ID;
    if (senderId) body.set("sender_id", senderId);

    const res = await fetch(SENDSMS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`sms.net.bd HTTP ${res.status}`);
    }

    const json = (await res.json()) as SendSmsResponse;
    if (json.error && json.error !== 0) {
      throw new Error(`sms.net.bd error ${json.error}: ${json.msg ?? "unknown"}`);
    }

    const requestId = json.data?.request_id;
    return { ok: true, messageId: requestId != null ? String(requestId) : undefined };
  }
}

let singleton: SmsAdapter | null = null;

/** The process SMS adapter. Swap-point for a different gateway later. */
export function getSmsAdapter(): SmsAdapter {
  if (!singleton) singleton = new SmsNetBdAdapter();
  return singleton;
}
