# Hybrid — Roadmap Gap Analysis & Unified Plan

> Date: 2026-06-24 | Source: two market-research papers
> ("Comprehensive Analysis of Shopify" + "Architecting a Localized Shopify Alternative for Bangladesh")
> cross-referenced against `docs/BUILD_CHECKLIST.md`, `.claude/team/BACKLOG.md`, and the Phase 2 blueprint.
> Purpose: identify features the research papers surface that are NOT yet on our roadmap, and slot them into a single prioritized plan.

---

## 1. Status snapshot

| Phase | Scope | State |
|---|---|---|
| Phase 0 | Multi-tenant spine, RLS, host routing, Doreja storefront, admin→ISR loop | DONE |
| Phase 1 | Sellable MVP — products, orders, COD+bKash(sandbox), Steadfast, SMS, manual billing, super-admin, signup | DONE |
| Phase 2 (M3) | Custom domains, theme catalog+customizer, discounts, multi-courier, COD reconciliation, GA4/Pixel/CAPI, WhatsApp, own-auth+S3 | ACTIVE |
| Phase 3 (M4) | Funnel builder, self-serve bKash billing, plan limits, staff roles | queued |
| Phase 4 (M5) | Full section editor, upsells, A/B, abandoned-cart, cohorts, app framework, scale | queued |

**Already covered by the current roadmap** (no action needed): custom domains, theme catalog + constrained customizer, discounts, multi-courier (Pathao/RedX/Paperfly), COD reconciliation, GA4 + Meta Pixel/CAPI analytics, WhatsApp notifications, funnel/landing builder, self-serve bKash/Nagad billing, staff roles, OS 2.0-style section editor, abandoned-cart recovery, cohort analytics, app/integration framework.

---

## 2. Gaps — in the research, NOT yet on our roadmap

### A. Regulatory — legally required to operate in BD (must)

| # | Feature | Why | Notes |
|---|---|---|---|
| 1 | **Escrow integration** | Bangladesh Bank: advance >10% must use a BB-approved escrow; funds release only on delivery proof | Bi-directional payment-gateway ↔ courier sync; courier "Delivered" webhook → escrow release payload. Sits beside COD recon. |
| 2 | **DBID Compliance Wizard** | Digital Business Identity is mandatory; ~86% rejection rate today | Collect NID/Trade License/TIN/BIN, guide submission, display DBID on storefront. High onboarding value. |
| 3 | **SLA enforcement + deadline alerts** | Digital Commerce Guidelines 2021: 48h courier handover, 5d same-city / 10d out-city delivery, 10d refund on failure | Order deadline timers + auto Bangla SMS to merchant & customer as deadlines approach. |
| 4 | **Unicode Bangla SMS enforcement** | BTRC prohibits phonetic Bangla (Banglish); grounds for gateway suspension | Validation that rejects Banglish in outbound templates. Cheap; do alongside Phase 2 WhatsApp/SMS work. |

### B. Differentiators — set us apart from eBitans/Boneek and Shopify (high value)

| # | Feature | Why |
|---|---|---|
| 5 | **F-commerce / social commerce automation** | 300k+ Facebook-selling pages are our primary acquisition target. Meta Graph API: comment ("দাম কত?") → auto-reply + comment-to-inbox → pre-filled checkout link in DM; central inventory deducts instantly. Phase 1 only has a static "Order on Messenger" link — no automation. **Biggest gap.** |
| 6 | **COD Fraud / "Delivery Success Score"** | Aggregate delivery outcomes across all tenants → per-phone refusal-rate score. On order placement, if refusal-rate > threshold (e.g. 30%), prompt merchant to take partial advance. Neutralizes the #1 cost of BD commerce; creates a network effect (more merchants → better scoring). |
| 7 | **Shipping rate calculator at checkout** | Division→District→Thana + volumetric weight → precise courier cost; auto-deduct COD commission (1% in-Dhaka, 2% out) from payouts. Pickers exist today, rate-calc does not. Naturally belongs in Phase 2 checkout. |

### C. Revenue / growth pillars (medium-high)

| # | Feature | Why |
|---|---|---|
| 8 | **Merchant financing / capital advance** | Use transaction visibility for algorithmic short-term advances (Shopify Capital / ShopUp "Baki" model); repay as fixed % of daily sales. Research names this the most lucrative pillar. Needs mature transaction history → Phase 4. |
| 9 | **More payment gateways (ShurjoPay, AamarPay)** | Aggregator hedge beyond bKash/Nagad/SSLCommerz (latter two arrive in Phase 2). |
| 10 | **Affiliate / agency partner program** | ~20% lifetime recurring commission → decentralized sales force (Marketorr/VISER X/Bizcope-style). |
| 11 | **Freemium / low entry tier** | BDT 849–3,300 benchmark; a $39 plan is incompatible with BD merchant economics (98.74% sell <$100/mo). Lock pricing with Phase 3 billing. |

### D. Depth — later, on scale (low priority for BD micro-merchants)

| # | Feature |
|---|---|
| 12 | Multi-location inventory + order routing |
| 13 | Metafields / Metaobjects (custom data extensibility) |
| 14 | B2B / Wholesale engine (Company object, price lists, payment terms, quantity rules) |
| 15 | POS / in-person retail (low BD relevance) |
| 16 | Merchant mobile app (React Native / Flutter) |
| 17 | Multi-currency / Shopify Markets (export sellers only) |

---

## 3. Unified plan (existing + new)

Recommendation: **finish Phase 2 as scoped** (do not inflate it). Add the BD-specific moat as a new **Phase 2.5 (M3.5)**.

```
Phase 2 (M3) — ACTIVE, ship as scoped
  domains · themes · customizer · discounts · multi-courier
  · COD reconciliation · GA4/Pixel/CAPI · WhatsApp · own-auth+S3
  + small add: Shipping rate calculator (#7) — checkout needs it anyway
  + small add: Unicode Bangla SMS validation (#4) — cheap, regulatory

Phase 2.5 (M3.5) — Regulatory + F-commerce wedge   ⭐ NEW
  · F-commerce automation: Meta Graph API, comment-to-inbox, checkout link (#5)
  · COD Fraud / Delivery Success Score (#6)
  · Escrow integration hook (courier → payment release) (#1)
  · DBID Compliance Wizard (#2)
  · SLA deadline timers + Bangla alerts (#3)

Phase 3 (M4) — as scoped + pricing/GTM
  · Funnel builder · self-serve bKash/Nagad billing · plan limits · staff roles
  + Freemium / low-tier pricing lock (#11)
  + More gateways: ShurjoPay + AamarPay (#9)
  + Affiliate / agency partner program (#10)

Phase 4 (M5) — as scoped + financing
  · Full section editor · upsells · A/B · abandoned-cart · cohorts · app framework
  + Merchant financing / capital advance (#8) — once transaction history matures

Phase 5+ (future depth)
  · Multi-location inventory · Metafields/Metaobjects · B2B engine
  · Merchant mobile app · POS · Multi-currency
```

**Rationale:** Phase 2.5 is the real moat — F-commerce automation (#5) + fraud scoring (#6) + regulatory compliance (#1–3) together differentiate Hybrid from both Shopify and local competitors. Financing (#8) is the most profitable pillar but depends on mature per-merchant transaction history, hence Phase 4.

---

## 4. Open decisions before Phase 2.5 build

- **F-commerce:** Meta App + Graph API permissions (`pages_messaging`, `pages_manage_metadata`) — founder creates Meta App; per-tenant Page connection via Embedded Signup (shares the WhatsApp app infra from Phase 2).
- **Fraud score:** define the cross-tenant data model (per-phone aggregate must NOT leak tenant-identifying order data across tenants — needs a platform-level aggregate computed via `asPlatformAdmin`, never exposed in tenant context).
- **Escrow:** which BB-approved escrow provider; confirm the gateway's escrow API surface (SSLCommerz supports escrow holds).
- **DBID:** whether to integrate the a2i/myInfo portal API or guide manual submission first.
- **SLA timers:** belongs in the FastAPI job service (`apps/api/`) alongside courier sync — confirm before building.
