// Hybrid Pay payment provider. PURE: fetch-like injected; no DB/Next/env.
//
// Hybrid Pay is Hybrid's single white-labeled online payment gateway. Customers
// never see "bKash"/"Nagad" as separate Hybrid options — they pick "Hybrid Pay"
// and choose the underlying method (bKash/Nagad/Rocket/card) on Hybrid Pay's
// hosted page. Under the hood Hybrid Pay speaks the self-hosted PipraPay API.
//
// Each tenant points at THEIR OWN brand on the shared Hybrid Pay instance
// (creds.baseUrl) and authenticates with their per-brand API key (creds.apiKey),
// sent as the `mhs-piprapay-api-key` header. There is no sandbox/live split —
// the instance URL IS the environment, so creds.mode is ignored here.
//
// Flow (server-side only — apiKey never leaves the backend):
//   create   POST {base}/api/checkout/redirect (json)
//              {full_name, email_address, mobile_number, amount, currency:BDT,
//               return_url, webhook_url, metadata}
//              -> {pp_id, pp_url}                 (redirect the customer to pp_url)
//   verify   POST {base}/api/verify-payment (json) {pp_id}
//              -> {status:"completed"|"refunded"|"pending"|..., amount,
//                  transaction_id, pp_id, ...}
//
// The gateway POSTs a webhook to the per-charge webhook_url on settlement; the
// callback route NEVER trusts that body — it re-verifies by pp_id here (the
// same not-trust-the-callback rule the bKash/SSLCommerz wiring follows).
import type {
  PaymentProvider,
  ProviderCreds,
  FetchLike,
  CreatePaymentInput,
  CreatePaymentResult,
  ExecutePaymentInput,
  ExecutePaymentResult,
  QueryPaymentInput,
  QueryPaymentResult,
} from "../types";
import { mapHybridpayState } from "./codes";

export interface HybridpayProviderOptions {
  fetch: FetchLike;
}

interface HybridpayKeys {
  apiKey: string;
  baseUrl: string;
}

export class HybridpayProvider implements PaymentProvider {
  readonly provider = "hybridpay" as const;

  private readonly fetch: FetchLike;

  constructor(opts: HybridpayProviderOptions) {
    this.fetch = opts.fetch;
  }

  // Strip a trailing slash so `${base}/api/...` never doubles up.
  private requireKeys(creds: ProviderCreds): HybridpayKeys {
    const apiKey = creds.apiKey;
    const baseUrl = creds.baseUrl?.replace(/\/+$/, "");
    if (!apiKey || !baseUrl) {
      throw new Error("Hybrid Pay credentials incomplete (apiKey/baseUrl required)");
    }
    return { apiKey, baseUrl };
  }

  private async post(
    keys: HybridpayKeys,
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await this.fetch(`${keys.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "mhs-piprapay-api-key": keys.apiKey,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult> {
    const keys = this.requireKeys(creds);

    // return_url (browser redirect back) and webhook_url (server-to-server) both
    // point at the caller's single callbackURL; the route distinguishes GET
    // (browser return) from POST (webhook). Both domains must be whitelisted +
    // active in the tenant's Hybrid Pay "Domains" section (onboarding step).
    const body = await this.post(keys, "/api/checkout/redirect", {
      full_name: "Customer",
      email_address: "",
      mobile_number: input.payerReference,
      amount: input.amount,
      currency: input.currency,
      return_url: input.callbackURL,
      webhook_url: input.callbackURL,
      metadata: { invoice_id: input.merchantInvoiceNumber },
    });

    const data = body as { pp_id?: string; pp_url?: string; error?: { message?: string } };
    if (!data.pp_url || !data.pp_id) {
      throw new Error(`Hybrid Pay charge create failed: ${data.error?.message ?? "no pp_url returned"}`);
    }

    return {
      state: "pending",
      paymentId: data.pp_id,
      redirectUrl: data.pp_url,
      raw: body,
    };
  }

  // execute == verify: the caller passes pp_id (from the webhook/return) as
  // paymentId so the PaymentProvider shape holds.
  async executePayment(input: ExecutePaymentInput, creds: ProviderCreds): Promise<ExecutePaymentResult> {
    return this.verify(input.paymentId, creds);
  }

  async queryPayment(input: QueryPaymentInput, creds: ProviderCreds): Promise<QueryPaymentResult> {
    return this.verify(input.paymentId, creds);
  }

  // POST verify-payment by pp_id; returns the settled amount for the server-side
  // amount match. Hybrid Pay returns the verified amount + gateway transaction id.
  private async verify(ppId: string, creds: ProviderCreds): Promise<ExecutePaymentResult> {
    const keys = this.requireKeys(creds);
    const body = await this.post(keys, "/api/verify-payment", { pp_id: ppId });

    const data = body as {
      status?: string;
      amount?: string | number;
      transaction_id?: string;
      error?: { message?: string };
    };

    return {
      state: mapHybridpayState(data.status),
      trxId: data.transaction_id,
      amount: data.amount === undefined ? undefined : String(data.amount),
      raw: body,
    };
  }
}
