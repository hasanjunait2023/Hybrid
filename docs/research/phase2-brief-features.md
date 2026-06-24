# Hybrid Phase 2 -- Feature Research Brief (M3)

> Date: 2026-06-24 | Researcher: Claude Sonnet 4.6
> Status: Decision-ready. Feed directly to Architect + CEO GATE 1.
> Scope: Phase 2 tasks 2.1--2.8 (BUILD_CHECKLIST.md Phase 2 section).

---

## How to read this brief

Each feature follows: Finding -> Recommendation (with schema sketch) -> Local-testable vs Live-deferred -> Risk -> Confidence.
Schema sketches are prose descriptions of fields and types -- not SQL. The Architect writes the SQL from these.
All file path references are absolute.

---

## 2.1 Custom Domains (Vercel for Platforms)

### Finding

The Vercel REST API endpoint for adding a domain programmatically is POST /v10/projects/{idOrName}/domains with Authorization: Bearer <VERCEL_API_TOKEN> and request body { name: customerdomain.com }. The response includes verified: boolean and verification: Array<{ type, domain, value, reason }>.

Verification challenge: The TXT challenge is only triggered when the domain is already assigned to another Vercel account. A fresh uncontested domain returns verified: true immediately once DNS resolves to Vercel. The challenge instructs the seller to add a TXT record at _vercel.<their-domain> with a specific value token. Trigger verification manually via POST /v9/projects/{idOrName}/domains/{domain}/verify. The 400 error codes from the verify endpoint distinguish: no-TXT-present, wrong-value, and TXT-belongs-to-another-project.

DNS record instructions to sellers:
- Apex domain (store.com): A record pointing to 76.76.21.21 (Vercel anycast IP, stable 2024-2025, confirmed in primary Vercel sources)
- Subdomain/www (www.store.com): CNAME pointing to a project-specific value in the format <hash>.vercel-dns-0XX.com (retrieved from Vercel dashboard or API per project at deploy time; do NOT hardcode)
- Both apex and www should be added; configure a 308 redirect from the non-primary to the primary using the redirect field on the domain API call

SSL provisioning: Vercel uses Lets Encrypt exclusively. Non-wildcard custom domains use HTTP-01 challenge handled automatically by Vercel once DNS resolves -- no seller action beyond pointing DNS. Wildcard subdomains like *.myhybrid.com use DNS-01 challenge and require Vercel nameservers; this is handled once at project setup, not per-seller. SSL typically issues within 2-10 minutes after DNS resolves. Critical gotcha confirmed by multiple sources: the Vercel API may return verified: true before the certificate is actually usable. These are two separate states that must be tracked separately in the UI.

CAA record caveat: Sellers with existing CAA records on their domain must add 0 issue letsencrypt.org or SSL issuance silently fails. This documented edge case needs a user-facing error path.

Middleware: d:/BD shopify/apps/web/lib/tenant/resolve.ts already queries tenant_domain WHERE domain = host AND verified = true and invalidateDomainCache(host) already exists (line 81). The middleware in d:/BD shopify/apps/web/middleware.ts already routes unknown hosts through resolveTenantByHost(). No middleware code changes are needed -- only tenant_domain rows need to be populated correctly. Call invalidateDomainCache when a domain is verified, removed, or a tenant is suspended.

Existing schema: d:/BD shopify/packages/db/sql/01_schema.sql already defines tenant_domain with domain (citext, unique), type (subdomain/custom), is_primary, ssl_status enum (none/pending/issued/failed), verified boolean, verification_token, verified_at. The ssl_status enum and verified boolean are sufficient for the full state machine. No new columns needed.

### Recommendation

Build the full UI and data layer first (local-testable), with Vercel API calls behind VERCEL_DOMAINS_ENABLED=true env flag. When the flag is off, the Server Action writes status to tenant_domain and returns DNS instructions without calling Vercel. The UI works end-to-end locally without a live Vercel account.

Domain status state machine (maps to existing ssl_status enum and verified field):
- State pending_dns: domain added to DB, DNS instructions shown. Stored as verified=false, ssl_status=none.
- State dns_verified: Vercel API confirms verified=true. Stored as verified=true, ssl_status=pending. UI shows SSL provisioning indicator.
- State ssl_issued: SSL poll confirms certificate active. Stored as verified=true, ssl_status=issued. Call invalidateDomainCache. Domain goes live.
- State failed: DNS unresolved after 48h or SSL error. Stored as ssl_status=failed with error reason.

Polling strategy: Poll GET /v9/projects/{id}/domains/{domain} every 5 seconds for DNS verification. Once verified=true, switch to 10-second interval SSL readiness poll for up to 15 minutes. Provide a manual Check Status button so sellers are not entirely passive.

Seller DNS instructions to display in settings UI:
- Apex: Add an A record pointing @ to 76.76.21.21
- www: Add a CNAME record pointing www to <project-cname value from env var VERCEL_CNAME_TARGET>
- Show both records simultaneously

Redirect: Add www.customerdomain.com as a second domain entry with redirect: customerdomain.com and redirectStatusCode: 308.

### Local-testable vs Live-deferred

Local: tenant_domain DB schema, settings UI, status state machine, middleware routing (add custom hosts to /etc/hosts for local test), Redis cache invalidation, admin Server Actions with flag off.

Live-deferred (requires VERCEL_API_TOKEN and live Vercel project): actual POST /v10/projects/.../domains API call, TXT verification resolution, SSL certificate issuance, CNAME value retrieval.

### Risk

- Vercel plan tier: Domains API requires Pro plan or higher. Confirm the Hybrid Vercel account tier before building. (medium risk -- not confirmed in sources)
- 48h apex DNS propagation must be explicitly communicated to sellers or they will raise support tickets. Display expected timing in the UI.
- CNAME value is project-specific; do not hardcode. Fetch from Vercel dashboard at deploy time and store as VERCEL_CNAME_TARGET env var.

Confidence: High (primary Vercel API docs confirmed 2026-06-24; verified against SDK code samples and practitioner implementation reports)


---

## 2.2 + 2.3 Theme Catalog + Visual Customizer (Constrained v1)

### Finding

The current codebase has one hardcoded theme (Doreja). d:/BD shopify/packages/db/sql/01_schema.sql already defines: theme table (code, name, default_settings jsonb, sections_schema jsonb, category enum); tenant_theme_settings table (tenant_id, theme_id, is_active boolean, settings jsonb); unique index tenant_theme_one_active on tenant_theme_settings(tenant_id) WHERE is_active = true.

d:/BD shopify/apps/web/lib/storefront/data.ts already queries tenant_theme_settings WHERE is_active=true (lines 95-104) and merges settings.colors into TenantContext.theme. The cache tag tenant:{id}:theme exists. revalidateTag(tenant:{id}:theme) is the correct invalidation call after any customizer save action.

Phase 2 vs Phase 4: Phase 2 = constrained customizer (fixed sections, JSON token overrides). Phase 4 = full section editor (OS 2.0 style, free drag-and-drop). The sections_schema jsonb column is a Phase 4 seam; do not populate it in Phase 2.

Live preview: Use two rows in tenant_theme_settings -- one is_active=true (live) and one is_active=false (draft). The admin customizer edits the draft row. Preview renders the storefront with a ?preview=<draft_id> query param that bypasses unstable_cache and reads the draft row directly, gated by admin session check server-side. Publish swaps is_active in one atomic transaction and calls revalidateTag. This keeps the existing unique index intact.

### Recommendation

settings JSON shape (stored in tenant_theme_settings.settings jsonb) has four top-level keys:

1. colors object: primary, accent, background, surface, text (all hex strings). Map to CSS custom properties on the storefront html element. Five color fields maximum for Phase 2.

2. typography object: headingFont and bodyFont (enum of 3-4 pre-approved font names only -- no arbitrary font URLs). Pre-subset and host approved fonts in packages/ui/ as WOFF2 files for CSP compliance.

3. content object: storeName, logoUrl, heroHeadline, heroSubline, heroCta, heroImageUrl.

4. sections array of objects: each has type (enum: hero | featured_products | collections_grid | trust_band | announcement_bar), enabled (boolean), position (integer 1-indexed). Storefront renders in position order, skipping disabled. Phase 2 supports exactly 5 section types -- no more.

Zod validation: Define ThemeSettingsSchema. Run in the admin Server Action before any DB write. Reject with Bengali error if invalid.

Draft/publish: Admin edits the is_active=false draft row. Live row stores draft_id in payload (soft reference). Publish swaps is_active in one transaction. The ?preview path MUST check admin session server-side -- missing this is an information disclosure vulnerability.

Theme switching: Create a new tenant_theme_settings row with the new theme_id and theme default_settings. Set old row is_active=false. Call revalidateTag(tenant:{id}:theme).

3 starter themes (founder sign-off required): Doreja (existing, general commerce), Megh (fashion/editorial), Bazar (electronics/dense grid). Themes must differ in React component tree, not only in color tokens. Scope creep guard: any request for free drag-and-drop or custom HTML input is Phase 4 -- refuse it.

### Local-testable vs Live-deferred

Fully local: DB schema, settings JSON, Zod validation, admin customizer UI, draft/publish flow, revalidateTag wiring, storefront rendering from JSON, preview iframe path.

Live-deferred: logo upload to Supabase Storage production (LocalBlobStore covers dev).

### Risk

- draft_id soft reference becomes stale if draft row is deleted outside the Server Action. Mitigate by enforcing deletion only through managed Server Action.
- Font enum only: do not allow arbitrary font URLs. Self-host 3-4 approved fonts as subsetted WOFF2 in packages/ui/.
- The ?preview path must be admin-session-gated server-side. Flag in adversarial review pass.

Confidence: High (schema and cache tag infrastructure already exists; storefront data layer already reads from it)

---

## 2.4 Discounts

### Finding

d:/BD shopify/packages/db/sql/01_schema.sql already defines the discount table completely: code (citext, unique per tenant), type enum (percentage/fixed_amount/free_shipping), value numeric, min_subtotal, usage_limit, used_count, per_customer_limit, applies_to jsonb (default scope:all), starts_at, ends_at, status enum (active/scheduled/expired/disabled).

d:/BD shopify/apps/web/lib/commerce/placeOrder.ts already includes discount_code and discount_total in the orders INSERT but both are currently null. The transaction structure (withTenant, reserveLine per item, INSERT orders, INSERT order_item, INSERT payment, update counters) already has the correct injection slot: after subtotal is computed from reserveLine results, before the orders INSERT.

### Recommendation

PlaceOrderInput needs one new optional field: discountCode: string | null.

Discount application algorithm (inside the existing withTenant transaction, after reserveLine calls, before orders INSERT):

Step 1 -- Validate code: SELECT discount ... WHERE code = discountCode AND status = active AND starts_at/ends_at window satisfied AND (usage_limit IS NULL OR used_count < usage_limit), using FOR UPDATE to lock the row against concurrent double-use.

Step 2 -- Check min_subtotal: if subtotal < discount.min_subtotal, throw DISCOUNT_BELOW_MINIMUM.

Step 3 -- Check per_customer_limit: if per_customer_limit IS NOT NULL, count prior orders for this customerId with this discount code. If count >= per_customer_limit, throw DISCOUNT_USAGE_LIMIT.

Step 4 -- Check applies_to scope: if scope = collection, verify at least one line item product is in the referenced collection IDs. If scope = product, verify at least one product_id matches. If no match, throw DISCOUNT_NOT_APPLICABLE.

Step 5 -- Compute discount_total: percentage = subtotal * (value/100) capped at subtotal. fixed_amount = min(value, subtotal). free_shipping = shipping_total (zeroing the shipping charge).

Step 6 -- Apply: grandTotal = subtotal - discount_total + effective_shipping_total.

Step 7 -- Increment used_count: UPDATE discount SET used_count = used_count + 1 WHERE id =  (inside same transaction; rolls back atomically if orders INSERT fails).

Update the orders INSERT to populate discount_code and discount_total columns. No client-side discount preview before checkout -- avoids pre-check race conditions.

### Local-testable vs Live-deferred

Fully local. Add discount test cases to d:/BD shopify/packages/db/test/checkout.test.ts.

### Risk

- FOR UPDATE creates a serialization point at high volume -- acceptable at Phase 2 scale.
- free_shipping discount requires shippingTotal to be non-null. Currently optional in PlaceOrderInput -- must be enforced when a free_shipping discount is applied.

Confidence: High (schema fully exists; algorithm maps cleanly to existing idempotent transaction)

---

## 2.5 Multi-Courier Unification (Pathao, RedX, Paperfly)

### Finding

d:/BD shopify/packages/couriers/src/types.ts defines CourierAdapter with createConsignment(input, creds), getStatus(consignmentId, creds), getBalance(creds). The provider field is typed as literal steadfast -- must be widened. CourierCreds has only apiKey and secretKey -- must be extended for Pathao OAuth.

Pathao API: Uses a hybrid client-credentials + username/password OAuth flow. Required credentials: client_id, client_secret, username, password. Returns a bearer token needing refresh. Create consignment requires store_id and a three-tier geography: city_id -> zone_id -> area_id (Pathao integer IDs, not division/district/thana names -- the key difference from Steadfast). A stage environment exists at https://hermes-api.p-stageenv.xyz for contract testing. No dedicated status polling endpoint confirmed in public packages; requires verification with a live Pathao merchant account.

RedX API: Has a developer portal at redx.com.bd/developer-api/. Community packages show area-based consignment creation (area IDs). Auth model appears to be API key or bearer token. PRIMARY SOURCE WAS INACCESSIBLE during research -- confidence on auth model is LOW. Must confirm with a live account before coding the adapter.

Paperfly API: No public sandbox. Credentials issued per-merchant by Paperfly team. Community package (codeboxr/paperfly-courier) shows create order, track, cancel, invoice retrieval. Auth via API key. Lowest-maturity API of the three -- treat as adapter stub in Phase 2.

ConsignmentInput mismatch: The existing ConsignmentInput maps 1:1 to Steadfast (free-text recipient_address). Pathao and RedX need city/zone/area IDs. The interface needs an optional courierArea field: { cityId?: string; zoneId?: string; areaId?: string } for adapters that require geographic ID resolution.

CourierCreds mismatch: Pathao needs clientId, clientSecret, username, password, and a cached bearer token with expiry. Add these as optional fields (existing Steadfast callers unaffected).

### Recommendation

Keep CourierAdapter as the public contract. Each adapter handles its own auth internally. Changes: widen provider literal to union (steadfast | pathao | redx | paperfly); add optional courierArea to ConsignmentInput; add optional Pathao OAuth fields to CourierCreds.

Build order for Phase 2:
1. Pathao first (widest BD merchant adoption; stage env available for contract tests)
2. RedX second (similar pattern to Pathao; confirm auth model first)
3. Paperfly: build adapter skeleton only, live verification deferred

Pathao geography: Admin courier settings let the merchant select their default Pathao city/zone/area from dropdowns populated by Pathao area list API (cached with TTL). Store selection in courier_account.credentials. At consignment creation, use the stored courierArea, with an override in the Send to Courier admin form.

Pathao bearer token refresh: Add tokenExpiry to CourierCreds. The adapter checks expiry before each call and refreshes if needed. Refreshed token is re-sealed and written back to courier_account.credentials via a refreshCallback provided by the caller (keeps the adapter pure -- no direct DB access).

Status polling: Pathao status polling endpoint is undocumented in public packages. The FastAPI service (Phase 1 seam in apps/api/) is the correct home for per-courier polling. Each adapter must implement getStatus even if it returns in_transit as a fallback until live endpoint is confirmed.

Per-tenant credentials: Stored encrypted in courier_account.credentials jsonb (already in schema) via sealCredentials / openCredentials in d:/BD shopify/packages/db/src/crypto.ts.

### Local-testable vs Live-deferred

Local: CourierAdapter interface extensions (SteadfastProvider unchanged), Pathao adapter against stage env, contract test suite following the pattern in d:/BD shopify/packages/db/test/courier-wire.test.ts.

Live-deferred (requires merchant accounts): Pathao live, RedX (confirm auth model first), Paperfly.

### Risk

- Pathao OAuth token refresh is the main complexity delta vs Steadfast (API key). The refreshCallback pattern is necessary to keep the adapter pure while still being able to update the stored token.
- RedX developer API page was inaccessible during research -- LOW confidence on auth model. Must be confirmed before coding the adapter.
- Paperfly has no sandbox and no public docs. Flag as live-deferred stub in Phase 2 DoD.
- Pathao geography ID staleness: if Pathao reorganizes zones, stored area_ids become stale. Cache zone lookups with TTL and provide a Refresh button in admin courier settings.

Confidence: Pathao medium-high (community packages + stage env); RedX LOW (page inaccessible); Paperfly LOW (no public docs)

---

## 2.6 COD Reconciliation Engine (THE differentiator)

### Finding

d:/BD shopify/packages/db/sql/01_schema.sql already defines both required tables:

shipment table already has: cod_amount (expected COD), cod_collected (courier reports), cod_remitted (paid out by courier), cod_status enum (pending/collected/remitted/reconciled/discrepancy), reconciled boolean, discrepancy_amount numeric, remittance_id FK to cod_remittance. Index shipment_tenant_codstatus_idx on (tenant_id, cod_status) already exists.

cod_remittance table already has: tenant_id, provider, reference (courier remittance/invoice ID), total_amount, remitted_at, payload jsonb.

Phase 1 courier sync already updates shipment.status and shipment.cod_collected when delivery is confirmed. The reconciliation engine adds the next layer: ingest what the courier actually remitted, match to expected shipments, flag discrepancies.

Remittance ingestion sources: Steadfast provides remittance reports via their merchant portal -- CSV download. No confirmed push API for remittance line items. Pathao/RedX/Paperfly: same CSV pattern. Safest Phase 2 approach: CSV upload in admin UI plus a manual mark-as-remitted action per shipment.

Discrepancy types to surface:
- Under-remittance: courier paid less than expected (most common -- fee deductions)
- Over-remittance: courier paid more (rare; reversal or error)
- No remittance: delivered shipment absent from all batches (most serious)
- Unmatched consignment: CSV line has no matching shipment row (data entry error or wrong tenant)

### Recommendation

Matching algorithm (runs as a Server Action using withTenant for all DB writes, with 500-row CSV limit for Phase 2):

Step 1 -- Ingest: Upload courier remittance CSV. Create one cod_remittance row per batch with total_amount and reference. Store raw CSV in payload jsonb.

Step 2 -- Parse: Each CSV line represents one consignment. Extract consignment_id, collected_amount, fee_deducted, net_remitted. Write a per-courier CsvParser interface; implement SteadfastCsvParser first (column names must be confirmed against a real report -- see Decisions).

Step 3 -- Match: For each parsed line, find shipment WHERE consignment_id = csv.consignment_id AND tenant_id = . If found: set cod_collected = csv.collected_amount, cod_remitted = csv.net_remitted, remittance_id = batch cod_remittance.id.

Step 4 -- Compute discrepancy: discrepancy_amount = shipment.cod_amount - shipment.cod_remitted. If discrepancy_amount = 0, set cod_status = reconciled. If discrepancy_amount != 0, set cod_status = discrepancy.

Step 5 -- Error handling: unmatched CSV lines (no shipment found) are stored as count in cod_remittance.unmatched_count for manual review.

Schema additions needed (not in current 01_schema.sql): Add to cod_remittance table: status field (pending/processed/failed), processed_at timestamptz, unmatched_count integer. These three columns track batch processing state. Architect writes the migration.

COD & Settlements admin view: summary totals (expected / collected / remitted / discrepancy delta); per-shipment table filterable by cod_status; batch remittance list with Upload CSV button; per-discrepancy Mark-Resolved action (manual override after merchant resolves with courier).

For large CSV files, offload processing to the FastAPI service queue in Phase 2+ (the apps/api/ seam already exists). Phase 2 launch: synchronous Server Action with 500-row limit is acceptable.

### Local-testable vs Live-deferred

Fully local: entire DB layer, matching algorithm, CSV parser, discrepancy computation, admin view. Test against hand-crafted CSV files.

Live-deferred: actual Steadfast remittance CSV column names must be confirmed against a real report from a live merchant account (column names used above are from Phase 1 research -- treat as likely-correct, verify before coding parser).

### Risk

- Courier fee deduction vs genuine discrepancy: standard fee deductions produce non-zero discrepancy_amount. Add expected_fee_rate to courier_account in a Phase 2+ refinement; for Phase 2 launch, flag all non-zero discrepancies and let the merchant decide.
- Partial delivery: shipments with partial_delivered status may have legitimately lower cod_amount vs cod_collected. Handle in the parser by checking shipment.raw_status.
- Consignment ID format inconsistency: some couriers zero-pad IDs or format them differently in CSV vs API. Normalize to trimmed string before matching.

Confidence: High for schema and algorithm; Medium for per-courier CSV column names (must be confirmed against real remittance report)

---

## 2.7 Analytics (GA4 + FB Pixel + CAPI)

### Finding

GA4 Measurement Protocol: Send purchase events server-side to https://www.google-analytics.com/mp/collect?measurement_id=G-XXXX&api_secret=YYYY. Required fields: client_id (from the _ga cookie), events[].name = purchase, events[].params.transaction_id (order ID -- dedup key), currency, value, items[]. Important 2025/2026 development: GA4 Measurement Protocol entered maintenance mode in 2025 -- Google is adding no new features. The new preferred server-side path is the Data Manager API (launched December 2025). For Phase 2, Measurement Protocol is still functional and is the correct choice -- re-evaluate at Phase 3.

Meta Pixel + CAPI deduplication: Both the browser-side Pixel event and the server-side CAPI event must carry the same event_id string (UUID v4). Meta matches on identical event_name, close timestamps, and identical event_id. When all three align, Meta merges and counts one event. Generate the UUID at the moment of the purchase event. Pass it back to the client via PlaceOrderResult so the browser Pixel fires with the same ID. The CAPI call fires server-side in the post-commit path, non-blocking -- same pattern as notifyOrderPlaced in d:/BD shopify/apps/web/lib/sms/notify.ts.

Per-tenant credential storage: Store in tenant.settings.analytics as { ga4MeasurementId, ga4ApiSecret, fbPixelId, fbAccessToken, fbTestEventCode }. ga4ApiSecret and fbAccessToken are secrets -- seal with sealCredentials. fbPixelId and ga4MeasurementId are public IDs (plain text is fine).

### Recommendation

Minimal event taxonomy for Phase 2 (only purchase needs dual-fire + dedup):
- view_item: client-side only (product page view)
- add_to_cart: client-side only (cart is a client component)
- initiate_checkout: client-side only (checkout page load)
- purchase: BOTH client-side and server-side with event_id dedup -- the money event

Implementation pattern: Add analyticsEventId?: string to PlaceOrderResult. Generate a UUID v4 in the checkout success page. Client fires fbq('track', 'Purchase', {...}, { eventID: uuid }) and the GA4 gtag purchase event. Server fires CAPI and GA4 Measurement Protocol calls non-blocking using the void-promise pattern matching d:/BD shopify/apps/web/lib/sms/notify.ts.

Store the event_id in payment.payload jsonb for dedup audit -- no separate table needed.

Internal events: The analytics_event table already exists (tenant_id, type, session_id, payload jsonb). Log order.placed, product.viewed, cart.added here for internal dashboard metrics without third-party dependency.

Settings UI: Add an Analytics section in admin settings with fields for GA4 Measurement ID, GA4 API Secret, FB Pixel ID, FB Access Token, FB Test Event Code (for staging).

Flag-gate actual GA4/CAPI calls with GA4_ENABLED and CAPI_ENABLED env vars so they do not fire in local dev or test.

### Local-testable vs Live-deferred

Local: settings UI, event generation code, dedup ID wiring, internal analytics_event writes (flag-gated external calls).

Live-deferred: actual GA4 measurement in Google Analytics console, Facebook event dedup verification (requires FB Events Manager account and test event code).

### Risk

- GA4 Measurement Protocol maintenance mode is a real concern for long-term investment. Plan migration to Data Manager API at Phase 3.
- The client_id from the _ga cookie is required for GA4 server-side events to be attributed to the right user session. Missing it causes (not set) for source/medium. The checkout success page must read and forward the _ga cookie value to the server-side call.
- fbAccessToken is a system user access token -- does not expire like page tokens but must be stored sealed and rotated if compromised.

Confidence: High for deduplication pattern; Medium for GA4 Measurement Protocol long-term viability (maintenance mode is confirmed)

---

## 2.8 WhatsApp Notifications (Cloud API)

### Finding

WhatsApp Cloud API is the direct Meta-hosted integration path (no BSP required). Per-tenant setup requires each tenant to have their own WABA (WhatsApp Business Account) and a phone number registered for Cloud API.

Multi-tenant model: The Embedded Signup flow is the production SaaS pattern -- the platform holds a Meta App; each tenant onboards via Embedded Signup, which returns a WABA ID, phone number ID, and an exchangeable token. Hybrid exchanges the token for a customer-scoped system user access token, seals it, and stores it per-tenant. This mirrors exactly the per-tenant bKash and Steadfast credential pattern.

Template messages: All order notifications via WhatsApp require pre-approved templates submitted to Meta. Approval takes 24-48h and can be rejected. Order confirmation is a Utility template type. Since July 2025, Utility templates are billed per message. Bangladesh falls into the Rest of World pricing tier -- approximately /usr/bin/bash.005-/usr/bin/bash.015 USD per message (EXACT BANGLADESH RATE NOT CONFIRMED in sources; check Meta pricing matrix before quoting costs to sellers).

Notification pattern: d:/BD shopify/apps/web/lib/sms/notify.ts contains notifyOrderPlaced() -- the exact pattern to extend. Add a notifyOrderPlacedWhatsApp() function that opens the tenant sealed WhatsApp creds, calls POST /v17.0/{phone_number_id}/messages with the approved template name and customer phone, runs non-blocking post-commit.

### Recommendation

Phase 2 scope: one Utility template for order confirmation only. Add a WhatsAppAdapter with a single sendOrderConfirmation(phone, templateVars, creds) method. Wire into post-order-placed path alongside SMS (additive, not replacing SMS). Per-tenant opt-in.

For Phase 2 launch: allow manual credential entry in admin settings (paste WABA ID, phone number ID, access token) -- same approach as bKash sandbox credentials today. Embedded Signup flow is Phase 3.

Template variable substitutions: customer name, order number, total amount in BDT, store name. The Bengali template text must be written by the founder and submitted to Meta Business Manager before Phase 2 launch date.

Credential storage: { wabaId, phoneNumberId, accessToken } stored in tenant.settings.notifications.whatsapp, sealed with sealCredentials. Reuses the existing AES-256-GCM encryption pattern in d:/BD shopify/packages/db/src/crypto.ts.

### Local-testable vs Live-deferred

Local: WhatsAppAdapter structure, template variable formatting, settings UI, credential sealing/unsealing.

Live-deferred: actual Meta API call, template approval, Embedded Signup flow (Phase 3), exact Bangladesh per-message pricing.

### Risk

- Template approval is on the critical path. The founder MUST submit the Bengali Utility template to Meta Business Manager before the Phase 2 release target. Rejection or revision adds 24-48h per cycle. This is the highest-probability Phase 2 blocker for this feature.
- Each tenant needs their own WABA and phone number -- a setup step some small merchants may not complete. WhatsApp must be opt-in and additive to SMS.
- Bangladesh WhatsApp adoption is high (greater than 80% of smartphone users) making this high-value despite setup friction.

Confidence: High for pattern; Bangladesh per-message pricing is LOW confidence (must verify against Meta pricing matrix)

---

## Decisions Needed from Architect

1. Draft theme schema: Two-row draft/publish model for tenant_theme_settings vs a draft_settings jsonb column on the live row. Brief recommends two-row. Confirm DB constraint handling and that the existing unique index (tenant_theme_one_active) is compatible with the swap-on-publish transaction.

2. Discount row lock: SELECT ... FOR UPDATE on the discount row inside withTenant -- confirm app_runtime_login role grants allow UPDATE on discount.used_count. The RLS policy in 02_policies.sql must permit this.

3. cod_remittance schema additions: status (pending/processed/failed), processed_at timestamptz, unmatched_count integer are not in current 01_schema.sql. Architect writes the migration for these three columns.

4. CourierCreds extension for Pathao OAuth: extend existing interface with optional fields vs use a discriminated union keyed by provider. Choice affects the crypto sealing format for existing Steadfast courier_account rows.

5. PlaceOrderInput.discountCode transaction ordering: confirm that inserting the discount validation step after reserveLine() but before the orders INSERT is compatible with the existing withTenant transaction and does not conflict with the FOR UPDATE lock scope.

6. VERCEL_CNAME_TARGET env var: confirm where to store the project-specific CNAME value and how to surface it in the domain settings UI.

7. analytics_event write path: The analytics_event table is tenant-scoped. Confirm that 02_policies.sql grants app_runtime_login INSERT permission on analytics_event. If not, add the policy.

---

## Decisions Needed from Founder

1. Vercel account plan: Confirm the Hybrid Vercel account is on Pro plan or higher (required for Domains API access). If not, custom domains cannot be built until upgraded.

2. 3 starter themes visual direction: Confirm Doreja (general) + Megh (fashion) + Bazar (electronics) or provide alternate theme names and visual references. The architect cannot scaffold the three theme component trees without this decision.

3. WhatsApp template text: Draft the Bengali order confirmation template message and submit to Meta Business Manager for approval before Phase 2 launch. Approval takes 24-48h; do not leave this to the last week of the phase.

4. Pathao merchant account for contract testing: The engineer building the Pathao adapter needs access to a Pathao merchant account (the stage env at https://hermes-api.p-stageenv.xyz). Founder or a pilot merchant must provide credentials.

5. Paperfly in Phase 2 vs Phase 3: Given no sandbox and no public API docs, confirm whether Paperfly should be in Phase 2 at all or deferred to Phase 3. Brief recommendation: defer to Phase 3 and build the adapter skeleton only.

6. COD remittance CSV format: Provide one real Steadfast remittance CSV (with sensitive data scrubbed) so the CSV parser is built against actual column names. Do not build the parser on assumed column names.

7. Facebook Business Manager setup: Confirm whether the Hybrid Meta App is already created and approved for CAPI access. Per-tenant CAPI requires the platform app to have the ads_management and business_management permissions at minimum.

---

## Executive Summary (12 lines)

2.1 Custom Domains: Use POST /v10/projects/{idOrName}/domains (Vercel REST API; docs dated 2026-06-24). Existing schema (tenant_domain), middleware (resolveTenantByHost), and cache invalidation (invalidateDomainCache) are all complete -- build behind VERCEL_DOMAINS_ENABLED flag; fully local-testable. Biggest risk: Vercel Pro plan required (confirm before coding); 48h apex DNS propagation must be explicitly communicated to sellers.

2.2+2.3 Theme Customizer: Schema (theme, tenant_theme_settings, cache tag tenant:{id}:theme, revalidation) already exists and the storefront data layer already reads from it. Build constrained settings JSON (4 keys: colors/typography/content/sections). Use two-row draft/publish. Biggest risk: scope creep toward free drag-and-drop is Phase 4 -- refuse it firmly. The ?preview path must be admin-session-gated.

2.4 Discounts: discount table fully defined. Plug discountCode into existing placeOrder transaction after reserveLine() using SELECT FOR UPDATE on the discount row. No new infrastructure needed. Fully local-testable. Biggest risk: concurrent usage-limit race mitigated by FOR UPDATE; free_shipping type requires shippingTotal to be non-null.

2.5 Multi-Courier: Widen CourierAdapter provider union; add optional courierArea to ConsignmentInput for Pathao city/zone/area ID system (key difference from Steadfast free-text address). Pathao has a stage env (hermes-api.p-stageenv.xyz) and is highest priority. RedX developer API page was inaccessible during research -- LOW confidence on auth model, must verify before coding. Paperfly: adapter skeleton only, defer live to Phase 3.

2.6 COD Reconciliation: Schema complete except three missing columns on cod_remittance (status, processed_at, unmatched_count). Algorithm: ingest CSV -- match by consignment_id -- compute discrepancy_amount -- set cod_status. Fully local-testable against crafted CSV files. Biggest risk: per-courier CSV column names must be confirmed against a real remittance report before coding parsers.

2.7 Analytics: GA4 Measurement Protocol (in maintenance mode since 2025 -- functional but frozen; plan Data Manager API migration at Phase 3) + Meta CAPI. Only the purchase event needs dual-fire with event_id dedup (UUID v4 shared between browser Pixel and server CAPI call). Pattern mirrors existing notifyOrderPlaced. Biggest risk: _ga cookie must be forwarded server-side for correct GA4 attribution.

2.8 WhatsApp: Extend SmsAdapter pattern with WhatsAppAdapter; single Bengali Utility template for order confirmation; manual creds in Phase 2, Embedded Signup in Phase 3. Biggest risk: Meta template approval is on the critical path -- the founder must submit the Bengali template before the Phase 2 release date. Bangladesh per-message pricing not confirmed (LOW confidence).

Cross-cutting: All 7 features are fully local-testable at the data/logic layer. Live-deferred only for: Vercel Domains API calls, courier live accounts (Pathao stage env available), GA4/CAPI external reporting, WhatsApp template approval. The existing withTenant / asPlatformAdmin / sealCredentials / revalidateTag infrastructure handles all Phase 2 features without new primitives.
