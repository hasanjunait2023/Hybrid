# Hybrid Pay — self-hosted PipraPay engine (infra runbook)

**Hybrid Pay** is Hybrid's single white-labeled online payment gateway. Under the
hood it is a self-hosted [PipraPay](https://github.com/PipraPay/PipraPay) instance
(AGPL-3.0, PHP). Customers never see "PipraPay" — they see **Hybrid Pay**, and on
its hosted page they pick the underlying method (bKash / Nagad / Rocket / card).

This doc is the operational runbook for standing up the engine and onboarding
tenants. The app-side integration (provider, checkout, webhook, settings) is
already shipped — this is the one piece that runs outside the Next.js app.

---

## Architecture

```
buyer ──checkout──► Hybrid (Next.js)
                      │  create-charge (tenant's brand API key)
                      ▼
            pay.hybrid.ecomex.cloud  ← ONE PipraPay instance (founder = super admin)
              ├─ brand: store-a  (API key A, bKash# A, companion app A)
              ├─ brand: store-b  (API key B, Nagad#  B, companion app B)
              └─ ...
                      │  webhook (pp_id)  →  /api/hybridpay/webhook
                      ▼
            Hybrid re-verifies by pp_id  →  marks order paid (paisa-exact)
```

- **One** PipraPay instance on the VPS. The founder is its super admin.
- **Each tenant = one PipraPay "brand"** with its own API key, MFS number, and
  companion-app device. That API key is what the tenant pastes into
  `Admin → Settings → Payments → Hybrid Pay`. Hybrid stores it sealed
  (AES-256-GCM) per-tenant in `payment_account` (provider `hybridpay`).
- Per-tenant payout isolation falls out of this: a charge made with brand A's key
  settles to brand A's number.

---

## 1. Bring up the engine

On the VPS (`/opt/hybrid`):

```bash
# 1. Clone the engine source next to the app (mounted by the compose service).
git clone https://github.com/PipraPay/PipraPay.git piprapay

# 2. Set the DB creds + base URL in .env (see .env.example "Hybrid Pay" block).
#    HYBRIDPAY_BASE_URL=https://pay.hybrid.ecomex.cloud
#    PIPRAPAY_DB_* = strong values

# 3. Start the engine containers (opt-in profile; does NOT affect the app stack).
docker compose -f docker-compose.prod.yml --profile hybridpay up -d piprapay piprapay-db
```

- `Caddyfile` already routes `pay.hybrid.ecomex.cloud → hybrid-piprapay:80`, and
  `pay.*` is allowlisted in the TLS ask-gate (`PLATFORM_HOSTS`), so Caddy issues
  the cert on first hit. Add the Cloudflare DNS record `pay → VPS IP` (grey-cloud,
  DNS-only, same as the other `*.hybrid.ecomex.cloud` records).
- First visit to `https://pay.hybrid.ecomex.cloud` runs PipraPay's web installer
  (`pp-requirement.php` → install). Point it at the `piprapay-db` MySQL service
  (host `hybrid-piprapay-db`, the `PIPRAPAY_DB_*` creds). Create the super-admin.

## 2. Onboard a tenant (per store)

Most of this is the tenant's self-serve flow in Hybrid; the brand creation is the
one super-admin step (PipraPay has no public brand-create API — it's an admin-panel
action):

1. **Super admin (founder):** in PipraPay admin → Brands → create a brand for the
   store. Generate an **API key** for it with scopes `create_payment` + `verify_payment`.
2. **Super admin:** in the brand's **Domains**, whitelist + activate the tenant's
   storefront domain (the one shown as "Webhook URL" in the tenant's Hybrid Pay
   settings, e.g. `store-a.hybrid.ecomex.cloud`). Without this, PipraPay rejects
   the charge ("domain not whitelisted") and payments never start.
3. **Tenant (self-serve, in Hybrid):** `Settings → Payments → Hybrid Pay`:
   - install the companion app on the phone holding their MFS number, log in to
     their brand,
   - enter their payment (bKash/Nagad) number,
   - paste the **API key**, enable, Save.
4. Done. A buyer who picks **Hybrid Pay** at checkout is redirected to the hosted
   page, pays to the tenant's number, the companion app + PipraPay verify it, and
   the webhook to `/api/hybridpay/webhook` marks the order paid in Hybrid.

> **Automation ceiling (honest):** steps 1–2 are super-admin actions because the
> PipraPay OSS build exposes brand/domain management only through its admin panel,
> not a public API. Everything the *tenant* does (3) is self-serve. If a future
> PipraPay release (or its `pp-adapter` admin API) exposes brand-create, steps 1–2
> can be automated from Hybrid's provisioning path — wire it into `provisionTenant`.

## 3. Verify the money path

- Test charge from a store's checkout → confirm redirect to `pay.hybrid.ecomex.cloud`.
- After paying, confirm the order flips to `paid` in admin (the webhook re-verifies
  by `pp_id` and matches the amount paisa-exact before marking paid; a mismatch is
  recorded as a discrepancy, never paid).
- `webhook_event(provider='hybridpay', external_id=pp_id)` is the replay guard —
  a webhook + browser-return for the same charge collapse to one paid transition.

---

## Security notes

- The tenant API key is sealed (AES-256-GCM) at rest, decrypted only server-side in
  `lib/payments/hybridpay.ts`, never logged or returned to the client.
- The webhook body is **never trusted** — the route re-verifies by `pp_id` against
  the tenant's key before changing any state (same rule as bKash/SSLCommerz).
- The callback origin is server-derived from the tenant's verified domain, never a
  client value (no open-redirect surface).
- PipraPay is AGPL-3.0: self-hosting is fine; if you distribute a modified PipraPay
  you must publish the source under AGPL. We do **not** modify PipraPay — we run it
  as-is and integrate over its HTTP API, so this is a use, not a derivative work.
