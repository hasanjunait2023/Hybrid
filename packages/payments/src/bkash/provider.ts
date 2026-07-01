// bKash Tokenized Checkout provider. PURE: fetch-like + TokenStore injected.
//
// Flow (server-side only — app_key/secret never leave the backend):
//   grant   POST /tokenized/checkout/token/grant     (headers username/password,
//                                                      body app_key/app_secret)
//             -> id_token, cached `grant_expiry`s (≈3600) via the TokenStore.
//   create  POST /tokenized/checkout/create          (Authorization: id_token,
//                                                      X-App-Key)
//             body {mode:"0001", payerReference, callbackURL, amount,
//                   currency:"BDT", intent:"sale", merchantInvoiceNumber}
//             -> paymentID, bkashURL
//   execute POST /tokenized/checkout/execute  {paymentID} -> trxID, transactionStatus
//   query   POST /tokenized/checkout/payment/status {paymentID}  (safety net)
//   refund  POST /tokenized/checkout/payment/refund  {paymentID, trxID, amount,
//                                                      reason, sku}
import type {
  PaymentProvider,
  ProviderCreds,
  FetchLike,
  TokenStore,
  CreatePaymentInput,
  CreatePaymentResult,
  ExecutePaymentInput,
  ExecutePaymentResult,
  QueryPaymentInput,
  QueryPaymentResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from "../types";
import { mapBkashState } from "./codes";

const SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
const LIVE_BASE = "https://tokenized.pay.bka.sh/v1.2.0-beta";

// Grant tokens are valid 3600s; cache slightly under that to avoid edge expiry.
const TOKEN_TTL_SECONDS = 3600;
const TOKEN_TTL_SAFETY_MARGIN = 60;

// Tokenized "sale" create mode per the brief.
const CREATE_MODE = "0001";

export interface BkashProviderOptions {
  fetch: FetchLike;
  tokenStore: TokenStore;
  // Cache key namespace, e.g. `bkash:token:${tenantId}`. Injected so the pure
  // package stays unaware of tenants — the app composes the key.
  tokenCacheKey: string;
}

export class BkashProvider implements PaymentProvider {
  readonly provider = "bkash" as const;

  private readonly fetch: FetchLike;
  private readonly tokenStore: TokenStore;
  private readonly tokenCacheKey: string;

  constructor(opts: BkashProviderOptions) {
    this.fetch = opts.fetch;
    this.tokenStore = opts.tokenStore;
    this.tokenCacheKey = opts.tokenCacheKey;
  }

  private baseUrl(creds: ProviderCreds): string {
    return creds.mode === "live" ? LIVE_BASE : SANDBOX_BASE;
  }

  private requireCreds(creds: ProviderCreds): Required<Pick<ProviderCreds, "username" | "password" | "appKey" | "appSecret">> {
    const { username, password, appKey, appSecret } = creds;
    if (!username || !password || !appKey || !appSecret) {
      throw new Error("bKash credentials incomplete (username/password/appKey/appSecret required)");
    }
    return { username, password, appKey, appSecret };
  }

  // Returns a cached id_token or grants a fresh one. Cached for TOKEN_TTL minus a
  // safety margin so a token never expires mid-request.
  // SET NX lock key prevents concurrent cache misses from stampeding bKash grant.
  async grant(creds: ProviderCreds): Promise<string> {
    const cached = await this.tokenStore.get(this.tokenCacheKey);
    if (cached) return cached;

    if (this.tokenStore.setNx) {
      const lockKey = `${this.tokenCacheKey}:lock`;
      const lockAcquired = await this.tokenStore.setNx(lockKey, "1", 10);
      if (!lockAcquired) {
        // Another instance is refreshing — poll up to 5× (200ms each = 1s total) to
        // wait for the in-flight grant to write the token. bKash grant typically takes
        // 300–800ms so 5 polls covers even slow responses without a fixed single sleep.
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 200));
          const afterWait = await this.tokenStore.get(this.tokenCacheKey);
          if (afterWait) return afterWait;
        }
        // Lock-holder took >1s — fall through as last resort to avoid hanging.
      }
    }

    const { username, password, appKey, appSecret } = this.requireCreds(creds);

    const res = await this.fetch(`${this.baseUrl(creds)}/tokenized/checkout/token/grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        username,
        password,
      },
      body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
    });

    if (!res.ok) {
      throw new Error(`bKash grant HTTP ${res.status}`);
    }
    const body = (await res.json()) as { id_token?: string; statusCode?: string; statusMessage?: string };
    if (!body.id_token) {
      throw new Error(`bKash grant failed: ${body.statusMessage ?? body.statusCode ?? res.status}`);
    }

    await this.tokenStore.set(this.tokenCacheKey, body.id_token, TOKEN_TTL_SECONDS - TOKEN_TTL_SAFETY_MARGIN);
    return body.id_token;
  }

  // Authorized POST helper: attaches a (cached) grant token + X-App-Key.
  private async authedPost(creds: ProviderCreds, path: string, payload: unknown): Promise<unknown> {
    const { appKey } = this.requireCreds(creds);
    const token = await this.grant(creds);

    const res = await this.fetch(`${this.baseUrl(creds)}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
        "X-App-Key": appKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`bKash HTTP ${res.status} for ${path}`);
    }
    return res.json();
  }

  async createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult> {
    const body = (await this.authedPost(creds, "/tokenized/checkout/create", {
      mode: CREATE_MODE,
      payerReference: input.payerReference,
      callbackURL: input.callbackURL,
      amount: input.amount,
      currency: input.currency,
      intent: "sale",
      merchantInvoiceNumber: input.merchantInvoiceNumber,
    })) as { paymentID?: string; bkashURL?: string; statusCode?: string; transactionStatus?: string };

    const state = mapBkashState(body);
    return {
      state,
      paymentId: body.paymentID ?? "",
      redirectUrl: body.bkashURL,
      raw: body,
    };
  }

  async executePayment(input: ExecutePaymentInput, creds: ProviderCreds): Promise<ExecutePaymentResult> {
    const body = (await this.authedPost(creds, "/tokenized/checkout/execute", {
      paymentID: input.paymentId,
    })) as { trxID?: string; amount?: string; statusCode?: string; transactionStatus?: string };

    return {
      state: mapBkashState(body),
      trxId: body.trxID,
      amount: body.amount,
      raw: body,
    };
  }

  async queryPayment(input: QueryPaymentInput, creds: ProviderCreds): Promise<QueryPaymentResult> {
    const body = (await this.authedPost(creds, "/tokenized/checkout/payment/status", {
      paymentID: input.paymentId,
    })) as { trxID?: string; amount?: string; statusCode?: string; transactionStatus?: string };

    return {
      state: mapBkashState(body),
      trxId: body.trxID,
      amount: body.amount,
      raw: body,
    };
  }

  async refund(input: RefundPaymentInput, creds: ProviderCreds): Promise<RefundPaymentResult> {
    const body = (await this.authedPost(creds, "/tokenized/checkout/payment/refund", {
      paymentID: input.paymentId,
      trxID: input.trxId,
      amount: input.amount,
      reason: input.reason,
      sku: input.sku,
    })) as { statusCode?: string; transactionStatus?: string; refundTrxID?: string };

    // A successful refund returns statusCode 0000; map to the refunded state.
    const state = body.statusCode === "0000" ? "refunded" : mapBkashState(body);
    return { state, raw: body };
  }
}
