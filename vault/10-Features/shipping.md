---
type: feature
status: done
panel: [admin, storefront]
area: shipping
migrations: [21]
commit: e1807db
owner: claude-opus
created: 2026-06-26
---

# Shipping rate calculator (M3)

## What
Per-tenant, zone-based shipping computed at checkout from destination
(Division→District→Thana) + parcel weight (sum of variant `weight_grams`).

## How
- **Migration 21**: `shipping_config` (origin, volumetric_divisor, free_above, default_rate, enabled)
  + `shipping_zone_rate` (zone, base, per_kg). RLS, idempotent.
- **Calc** `lib/commerce/shipping.ts`: `zoneFor` (same_district/same_division/other_division),
  `billableKg` (ceil, 1kg floor), `computeShipping` (base + per_kg, free_above, default fallback).
  `calculateShipping` loads config+rates+weights+subtotal via `withTenant` (DB prices, authoritative).
- **Admin** Settings → Shipping & delivery (configure origin + 3 zone rates + free-above).
- **Checkout**: `submitCheckout` computes shipping server-side → `placeOrder` (grand_total/cod_amount);
  `quoteShipping` action + live shipping line in `CheckoutForm`.
- 6 db tests + 7 sms tests. Live on prod (migration 21 applied 2026-06-26).

## Follow-up
- [ ] **Volumetric weight** — needs product L×W×H dimensions (not captured yet). Actual weight used
  now; `volumetric_divisor` stored so the calc can switch to `max(actual, volumetric)` once dims land.
- [ ] Auto COD-commission deduction in settlement display (separate from checkout shipping).

## Links
[[vault/30-Ops/migration-ledger]] · `apps/web/lib/commerce/shipping.ts`
