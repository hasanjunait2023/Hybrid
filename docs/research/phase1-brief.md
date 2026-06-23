# Phase 1 Integration Research Brief — Hybrid (decision-ready)

> Produced at RESEARCH/M2. Feeds the Phase-1 architect blueprint. Primary-source citations in the full version; summary below.

## Autonomous decisions made (CEO, 2026-06-23)
- **bKash:** integrate **Tokenized Checkout (popup/iframe)** for storefront checkout. SaaS subscription billing stays **manual record** in Phase 1 (Agreement/Recurring API is "under development"). Build + test against the **public sandbox** (creds below) — real integration, live-testable NOW.
- **Steadfast:** build the **real adapter** to the documented API. NO sandbox exists → live verification deferred until a merchant account exists; until then, contract-test against documented request/response shapes (NOT a stub — real code, real shapes). Status sync via a Next.js cron route in Phase 1 (FastAPI in Phase 2).
- **Auth:** keep the HMAC-secured **dev-login as the local provider** (local-first, no Docker). Implement the **Supabase Auth provider behind the SAME getSession() seam** (`@supabase/ssr`, `getUser()`), activated when Docker (`supabase start`) or a Supabase cloud project exists. app_user.id = auth.users.id; trigger creates app_user only; tenant provisioning is a separate Server Action via asPlatformAdmin.
- **Address data:** `bangladesh-location-data` npm (EN + BN exports; 8 div / 64 dist / 490+ upazila) for cascading checkout pickers.
- **SMS:** `sms.net.bd` (Alpha Net) HTTP adapter; live-send deferred to account/credits + masking sender-id approval (6–7 days). Build the adapter real.

## FOUNDER ACTION (time-sensitive, parallel to dev)
- Start **bKash merchant onboarding** now (~2–4 wks for production app_key/secret).
- Get a **Steadfast merchant account** (portal.steadfast.com.bd) — required for ANY live courier test (no sandbox).
- Decide Supabase: install Docker for `supabase start` OR create a Supabase cloud project for auth. (Local dev continues on dev-login until then.)

## 1. bKash Tokenized Checkout
Sandbox base `https://tokenized.sandbox.bka.sh/v1.2.0-beta`; prod `https://tokenized.pay.bka.sh/v1.2.0-beta`.
Public sandbox creds: user `sandboxTokenizedUser02` / pass `sandboxTokenizedUser02@12345` / app_key `4f6o0cjiki2rfm34kfdadl1eqq` / app_secret `2is7hdktrekvrbljjh44ll3d9l1dtjo4pasmjvs5vl5qr3fug4b`. Test wallets: success 01770618575 (PIN 12121, OTP 123456); fail 01823074817.
Flow (backend-only; never expose app_key client-side):
1. **Grant Token** POST `/tokenized/checkout/token/grant` (headers username/password, body app_key/app_secret) → id_token (cache 3600s, refresh ≤28d).
2. **Create** POST `/tokenized/checkout/create` (Authorization: id_token, X-App-Key) body {mode:"0001", payerReference:phone, callbackURL, amount, currency:"BDT", intent:"sale", merchantInvoiceNumber=payment.id} → paymentID + bkashURL. paymentID valid 24h single-use.
3. **Execute** POST `/tokenized/checkout/execute` {paymentID} → trxID + transactionStatus Completed/Failed. Call from callback server-side.
4. **Query** POST `/tokenized/checkout/payment/status` {paymentID} — safety net if execute/callback lost.
Refund POST `/tokenized/checkout/payment/refund` {paymentID,trxID,amount,reason,sku} (docs stub — smoke-test in sandbox).
State machine → payment.status: pending → success(execute 0000/Completed) | failed | cancelled | refunded. provider_transaction_id=trxID. Callback is a browser GET hint (?paymentID&status) — ALWAYS execute+query server-side; store raw in webhook_event unique(provider,external_id=paymentID).

## 2. Steadfast
Base `https://portal.steadfast.com.bd/api/v1`. Headers `Api-Key`, `Secret-Key`, `Content-Type: application/json`. NO sandbox.
Endpoints: POST `/create_order` (single), POST `/create_order/bulk-order` (≤500), GET `/status_by_cid/{id}`, `/status_by_invoice/{inv}`, `/status_by_trackingcode/{code}`, GET `/get_balance`.
create_order body: {invoice, recipient_name, recipient_phone, recipient_address, cod_amount(int BDT), note} → consignment.{consignment_id, tracking_code}.
Status map → shipment_status / order_fulfillment_status: pending/in_review→created/confirmed; hold/delivered_approval_pending→in_transit; delivered/partial_delivered→delivered/delivered; cancelled→cancelled/returned; unknown*→in_transit. Poll every 30–60m via Next route /api/internal/courier-sync (+ optional webhook). 
Adapter (packages/couriers): CourierAdapter { createConsignment(ConsignmentInput):ConsignmentResult; getStatus(cid):{status,raw}; getBalance():number }. Steadfast impl in steadfast.ts.
RISK: no COD remittance/settlement API documented → Phase-2 reconciliation needs manual/scrape/custom endpoint. Note now.

## 3. Supabase Auth behind getSession()
@supabase/supabase-js + @supabase/ssr. AUTH ONLY via supabase; tenant data stays on postgres.js withTenant (separate paths — do NOT let ssr near tenant queries). getSession() body → createServerClient(...).auth.getUser() (use getUser not getSession — revalidates). Map auth.users → app_user (app_user.id = auth.users.id recommended; or add supabase_auth_id uuid unique). Trigger on_auth_user_created (security definer) inserts app_user ONLY (trigger failure blocks signup — keep minimal). Provisioning = separate Server Action post-signup via asPlatformAdmin: INSERT tenant + tenant_domain(subdomain) + tenant_member(owner) + subscription(trialing, +14d). Middleware must refresh token (getClaims) + propagate cookies. Local: `supabase start` (Docker, 7GB RAM) with config.toml [auth.sms.test_otp] pinned codes; prod phone OTP needs Twilio/MessageBird/Vonage. Phone+email both (phone matters in BD).

## 4. Idempotent checkout (one withTenant transaction)
customer upsert by (tenant,phone) → customer_address upsert → atomic inventory decrement (UPDATE ... WHERE inventory_quantity >= qty AND track_inventory RETURNING; null→throw INSUFFICIENT_STOCK) → INSERT orders (order_number via trigger) → INSERT order_item (price snapshot) → INSERT payment (id=idempotency key=merchantInvoiceNumber). COD: payment_status unpaid, cod_amount=grand_total, confirm immediately + SMS. bKash: status pending → create payment API → popup → callback execute → success → payment_status paid. Webhook replay guard: webhook_event unique(provider,external_id) ON CONFLICT DO NOTHING (process only when insert succeeds). Double-submit: merchantInvoiceNumber=payment.id; recover via Query.

## 5. Address data
`bangladesh-location-data` (MIT). Exports divisions_en/bn, districts_en/bn (keyed by division value→array), upazilas_en/bn (keyed by district). Maps to customer_address.division/district/thana (text). Alt: nuhil/bangladesh-geocode (raw JSON + GPS).

## 6. SMS
`sms.net.bd` (Alpha Net). GET/POST `https://api.sms.net.bd/sendsms?api_key&msg(unicode)&to&sender_id`. Bengali unicode OK. Masking sender-id needs 6–7d approval (numeric until then). Adapter SmsAdapter.send(to,message):{ok,messageId}.

## Risks (severity)
HIGH: bKash prod onboarding 2–4wk; Steadfast no sandbox + needs merchant account. MED: Supabase local needs Docker (absent) or cloud; bKash refund docs stub; Steadfast no COD-remittance API (Phase-2 reconciliation snag); supabase trigger can block signups. LOW: supabase start 7GB RAM; upazila count 490 vs 495.
