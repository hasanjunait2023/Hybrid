// SSLCommerz payment provider. PURE: fetch-like injected; no DB/Next/env.
//
// SSLCommerz uses store_id + store_password (no OAuth, no per-merchant keypair).
// Sensitive payloads are form-urlencoded; responses are JSON.
//
// Flow (server-side only — store_password never leaves the backend):
//   create   POST /gwprocess/v4/api.php (form) {store_id, store_passwd,
//                  total_amount, currency:BDT, tran_id, success_url, fail_url,
//                  cancel_url, ipn_url, product info...}
//              -> {status:"SUCCESS", GatewayPageURL, sessionkey}
//   verify   GET  /validator/api/validationserverAPI.php?val_id=...&store_id=...
//                  &store_passwd=...&format=json
//              -> {status:"VALID"|"VALIDATED", amount, currency, tran_id,
//                  bank_tran_id, val_id}
//
// IPN posts back to the tenant's ipn_url (manually registered in the merchant
// panel); the callback route re-validates by val_id (never trusts the IPN body).
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
import { mapSslcommerzInitState, mapSslcommerzTxnState } from "./codes";

const SANDBOX_BASE = "https://sandbox.sslcommerz.com";
const LIVE_BASE = "https://securepay.sslcommerz.com";

export interface SslcommerzProviderOptions {
  fetch: FetchLike;
}

interface SslKeys {
  storeId: string;
  storePassword: string;
}

export class SslcommerzProvider implements PaymentProvider {
  readonly provider = "sslcommerz" as const;

  private readonly fetch: FetchLike;

  constructor(opts: SslcommerzProviderOptions) {
    this.fetch = opts.fetch;
  }

  private baseUrl(creds: ProviderCreds): string {
    return creds.mode === "live" ? LIVE_BASE : SANDBOX_BASE;
  }

  private requireKeys(creds: ProviderCreds): SslKeys {
    const { storeId, storePassword } = creds;
    if (!storeId || !storePassword) {
      throw new Error("SSLCommerz credentials incomplete (storeId/storePassword required)");
    }
    return { storeId, storePassword };
  }

  async createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult> {
    const keys = this.requireKeys(creds);

    // SSLCommerz needs distinct success/fail/cancel callbacks; we point all three
    // at the single caller callbackURL (the route handler reads the posted status).
    const form = toForm({
      store_id: keys.storeId,
      store_passwd: keys.storePassword,
      total_amount: input.amount,
      currency: input.currency,
      tran_id: input.merchantInvoiceNumber,
      success_url: input.callbackURL,
      fail_url: input.callbackURL,
      cancel_url: input.callbackURL,
      ipn_url: input.callbackURL,
      cus_phone: input.payerReference,
      product_name: input.merchantInvoiceNumber,
      product_category: "general",
      product_profile: "general",
      shipping_method: "NO",
    });

    const res = await this.fetch(`${this.baseUrl(creds)}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    const body = (await res.json()) as {
      status?: string;
      GatewayPageURL?: string;
      sessionkey?: string;
      failedreason?: string;
    };

    if (body.status !== "SUCCESS" || !body.GatewayPageURL) {
      throw new Error(`SSLCommerz session create failed: ${body.failedreason ?? body.status ?? res.status}`);
    }

    return {
      state: mapSslcommerzInitState(body),
      paymentId: input.merchantInvoiceNumber,
      redirectUrl: body.GatewayPageURL,
      raw: body,
    };
  }

  // SSLCommerz "execute" = validate by val_id. The caller passes the val_id (from
  // the IPN/redirect) as paymentId here so the same PaymentProvider shape holds.
  async executePayment(input: ExecutePaymentInput, creds: ProviderCreds): Promise<ExecutePaymentResult> {
    return this.validate(input.paymentId, creds);
  }

  async queryPayment(input: QueryPaymentInput, creds: ProviderCreds): Promise<QueryPaymentResult> {
    return this.validate(input.paymentId, creds);
  }

  // GET the validation API by val_id; returns the settled amount for the
  // server-side amount match.
  private async validate(valId: string, creds: ProviderCreds): Promise<ExecutePaymentResult> {
    const keys = this.requireKeys(creds);
    const qs = new URLSearchParams({
      val_id: valId,
      store_id: keys.storeId,
      store_passwd: keys.storePassword,
      format: "json",
    }).toString();

    const res = await this.fetch(
      `${this.baseUrl(creds)}/validator/api/validationserverAPI.php?${qs}`,
      { method: "GET", headers: { Accept: "application/json" } },
    );

    const body = (await res.json()) as {
      status?: string;
      amount?: string;
      tran_id?: string;
      bank_tran_id?: string;
      val_id?: string;
    };

    return {
      state: mapSslcommerzTxnState(body),
      trxId: body.bank_tran_id ?? body.tran_id,
      amount: body.amount,
      raw: body,
    };
  }
}

// Encode a flat string map as application/x-www-form-urlencoded.
function toForm(fields: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  return params.toString();
}
