// @hybrid/payments public types. PURE: no Next, no DB, no env reads. The HTTP
// transport (a fetch-like) and the bKash token cache (a TokenStore) are injected
// by the caller — this package never reaches the network or a clock on its own
// except through what it is handed.

// Terminal + in-flight states a payment can be in, mapped from provider codes.
export type PaymentState = "pending" | "success" | "failed" | "cancelled" | "refunded";

// A minimal fetch-like. Matches the global `fetch` signature subset we use, so
// callers can pass the platform `fetch` directly or a stub in tests.
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

// Provider credentials. Pulled from the (decrypted) payment_account.credentials
// jsonb by the caller and passed in per-call. mode selects sandbox vs live base
// URL. cod has no creds (creds optional at the provider boundary).
export interface ProviderCreds {
  mode: "sandbox" | "live";
  // bKash Tokenized creds. Required for the bkash provider; absent for cod.
  username?: string;
  password?: string;
  appKey?: string;
  appSecret?: string;
}

// --- create -----------------------------------------------------------------
export interface CreatePaymentInput {
  // Server-computed amount. String to preserve exact decimals across the wire
  // (bKash expects a string "amount"); never derive from client input.
  amount: string;
  currency: "BDT";
  // payment.id — doubles as the idempotency key / merchantInvoiceNumber.
  merchantInvoiceNumber: string;
  // Customer phone (payerReference for bKash).
  payerReference: string;
  // Server callback the gateway redirects the popup back to.
  callbackURL: string;
}

export interface CreatePaymentResult {
  state: PaymentState;
  // bKash paymentID (24h single-use). For COD this is the merchantInvoiceNumber.
  paymentId: string;
  // Redirect/popup URL the storefront opens. Empty for COD (instant confirm).
  redirectUrl?: string;
  raw: unknown;
}

// --- execute ----------------------------------------------------------------
export interface ExecutePaymentInput {
  paymentId: string;
}

export interface ExecutePaymentResult {
  state: PaymentState;
  // Gateway transaction id (provider_transaction_id). Absent until success.
  trxId?: string;
  raw: unknown;
}

// --- query ------------------------------------------------------------------
export interface QueryPaymentInput {
  paymentId: string;
}

export interface QueryPaymentResult {
  state: PaymentState;
  trxId?: string;
  raw: unknown;
}

// --- refund -----------------------------------------------------------------
export interface RefundPaymentInput {
  paymentId: string;
  trxId: string;
  amount: string;
  reason: string;
  sku: string;
}

export interface RefundPaymentResult {
  state: PaymentState;
  raw: unknown;
}

// The provider contract every gateway implements. createPayment/executePayment/
// queryPayment are mandatory; refund is optional (bKash has it, COD does not).
export interface PaymentProvider {
  provider: "bkash" | "cod";
  createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult>;
  executePayment(input: ExecutePaymentInput, creds: ProviderCreds): Promise<ExecutePaymentResult>;
  queryPayment(input: QueryPaymentInput, creds: ProviderCreds): Promise<QueryPaymentResult>;
  refund?(input: RefundPaymentInput, creds: ProviderCreds): Promise<RefundPaymentResult>;
}

// Injectable token cache for bKash grant tokens. Backed by Redis in the app
// (key bkash:token:{tenant}); a Map in tests. get returns null on miss/expiry.
export interface TokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
