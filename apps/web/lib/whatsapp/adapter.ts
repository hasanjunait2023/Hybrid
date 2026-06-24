// WhatsApp Cloud API adapter (blueprint 2.8 S-WHATSAPP). PURE: fetch + creds
// injected per-call, mirroring the bKash/Steadfast adapter shape so it is unit
// testable without a network or env.
//
// Phase-2 scope is ONE Utility template: order confirmation. The Bengali
// template body is authored + submitted to Meta by the founder (24-48h
// approval, critical path). The adapter only references its approved NAME and
// language code; the message copy lives in Meta, not in code.
//
//   send  POST https://graph.facebook.com/v17.0/{phoneNumberId}/messages
//         Authorization: Bearer {accessToken}
//         { messaging_product: "whatsapp", to, type: "template",
//           template: { name, language, components:[{type:"body",parameters}] } }

const GRAPH_BASE = "https://graph.facebook.com/v17.0";

// The approved Utility template name + language. Bengali = "bn". The founder
// submits the template under this exact name in Meta Business Manager.
export const ORDER_CONFIRMATION_TEMPLATE = "order_confirmation";
export const TEMPLATE_LANGUAGE = "bn";

// Same minimal fetch-like contract used across @hybrid integration packages so
// the platform `fetch` (or a stub) can be passed directly.
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

// Decrypted from tenant.settings.notifications.whatsapp.credentials by the
// caller. accessToken is the secret; all three are sealed at rest.
export interface WhatsAppCreds {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

// Variables substituted into the approved template's body, in positional order:
// {{1}}=customerName {{2}}=orderNumber {{3}}=totalBdt {{4}}=storeName.
export interface OrderConfirmationVars {
  customerName: string;
  orderNumber: string;
  totalBdt: string;
  storeName: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  /** Provider message id (wamid) when the API returns one. */
  messageId?: string;
}

export interface WhatsAppAdapterOptions {
  fetch: FetchLike;
}

// Cloud API success envelope: { messages: [{ id }] }. An error envelope is
// { error: { message, code, ... } }.
interface WhatsAppApiResponse {
  messages?: { id?: string }[];
  error?: { message?: string; code?: number };
}

export class WhatsAppAdapter {
  private readonly fetch: FetchLike;

  constructor(opts: WhatsAppAdapterOptions) {
    this.fetch = opts.fetch;
  }

  async sendOrderConfirmation(
    phone: string,
    vars: OrderConfirmationVars,
    creds: WhatsAppCreds,
  ): Promise<WhatsAppSendResult> {
    if (!creds.phoneNumberId || !creds.accessToken) {
      throw new Error("WhatsApp credentials incomplete (phoneNumberId/accessToken required)");
    }

    const body = JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: ORDER_CONFIRMATION_TEMPLATE,
        language: { code: TEMPLATE_LANGUAGE },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: vars.customerName },
              { type: "text", text: vars.orderNumber },
              { type: "text", text: vars.totalBdt },
              { type: "text", text: vars.storeName },
            ],
          },
        ],
      },
    });

    const res = await this.fetch(`${GRAPH_BASE}/${creds.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as WhatsAppApiResponse | null;
      throw new Error(
        `WhatsApp Cloud API HTTP ${res.status}: ${json?.error?.message ?? "unknown"}`,
      );
    }

    const json = (await res.json()) as WhatsAppApiResponse;
    const messageId = json.messages?.[0]?.id;
    return { ok: true, messageId };
  }
}
