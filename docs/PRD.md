# Hybrid — Product Requirements (digest)

**Working name:** Hybrid (a "Shopify for Bangladesh"). Owner: Junait. Target: Bangladesh e-commerce + F-commerce sellers. Type: Multi-tenant SaaS (store builder + storefront + funnel builder + super-admin).

> Full vision is multi-year. Solo-founder path = phased roadmap (see BUILD_CHECKLIST). Ship a sharp MVP wedge first, prove revenue, then expand.

## Executive summary
Multi-tenant SaaS letting any Bangladeshi seller spin up a complete online store (admin backend + customer storefront) in minutes, choose a theme, connect a domain, build landing pages/funnels — no code. Localized Shopify alternative: Bengali-first UX, bKash/Nagad/SSLCommerz + COD as first-class, native courier integration (Steadfast/Pathao/RedX/Paperfly) with COD reconciliation, mobile-first storefronts, BDT pricing payable via bKash.

## Four product surfaces
1. **Tenant Admin** — products, orders, customers, courier, payments, analytics.
2. **Tenant Storefront** — live site rendered from chosen theme; admin edits appear instantly (pure renderer of DB data + theme JSON).
3. **Theme + Landing/Funnel Builder** — pick theme, customize visually, build CartFlows-style funnels.
4. **Platform Super-Admin + Marketing Site** — manage tenants/billing/plan limits + public marketing site.

## Market (why)
- BD e-commerce GMV ~$3B 2025 → ~$4B 2026, +25–30%/yr.
- ~300k+ Facebook-page sellers (F-commerce); ~78% mobile; COD ~70–75%; bKash $30B+/yr.
- Most F-sellers earn BDT 10k–100k/mo — small, price-sensitive, non-technical.
- Pain: no real website, orders lost in Messenger, can't track COD across couriers, look untrustworthy.

## Differentiators (moat)
1. COD + multi-courier reconciliation (real money-leakage problem).
2. Bengali-first storefront + admin + support.
3. Funnel/landing builder included (not paid add-on).
4. bKash-native SaaS billing (removes card-payment barrier).

## Personas
- P1 Reshmi — F-commerce seller, 30–300 orders/mo, Messenger + Steadfast/Pathao, mobile-only. **Core wedge.**
- P2 Arif — growing SME, 500–3000 orders/mo, hates WooCommerce. Higher ARPU.
- P3 Dropshipper — single-product FB-ad funnels. Heavy funnel-builder user.
- P4 Junait — platform owner, super-admin + marketing.

## Goals
1. Self-onboard → live themed `*.<root>` store in <10 min.
2. Custom domain + auto-SSL in a few steps.
3. Admin edits reflect on storefront immediately (one source of truth).
4. Native bKash/Nagad/SSLCommerz/COD checkout.
5. Native courier dispatch + COD reconciliation.
6. Theme picker + visual customizer + landing/funnel builder.
7. Super-admin: tenants, plans, billing in BDT via bKash.
8. Hard tenant isolation (DB-layer RLS).

## Non-goals (v1–v2)
No app marketplace/SDK; not a multi-vendor marketplace; not accounting/ERP; not multi-currency at launch (BDT-first); not free-form drag-anything editor in v1 (constrained section editor first).

## Architecture
- **Multi-tenancy:** single Supabase Postgres; every tenant table has `tenant_id`; RLS via `app.current_tenant_id` session var (set per request after auth). Single most important security contract.
- **Hosting/domains:** Vercel for Platforms — one Next.js deploy serves all tenants; wildcard subdomains + custom-domain attach + auto-SSL. Backup: Cloudflare for SaaS.
- **Resolution:** `middleware.ts` reads host → tenant lookup (Redis/edge cache) → internal rewrite to `/_sites/[tenant]/...`. SSR + ISR; on-demand revalidation on admin edits.
- **Theme engine:** JSON-driven sections (Shopify OS 2.0 style). Tenant customization persisted as JSON; storefront walks tree, renders React sections. No per-tenant code.
- **Funnel builder:** same JSON-block model; `landing_page` holds block tree + funnel config.
- **Payments:** `PaymentProvider` interface (pluggable); webhooks; idempotent order-payment state machine. SaaS billing via bKash/Nagad recurring or manual top-up + grace.
- **Couriers:** adapters per provider (create consignment, fetch status, fetch remittance). Reconciliation engine matches order.cod_amount → collected → remitted; surfaces discrepancies.

## Stack
Next.js (App Router) on Vercel for Platforms · Supabase Auth · Supabase Postgres + RLS · Upstash Redis · FastAPI for heavy/async (courier sync, reconciliation) · Supabase Storage/S3 + image CDN · bKash/Nagad/SSLCommerz/COD · Steadfast/Pathao/RedX/Paperfly · SMS gateway + WhatsApp Cloud API + email · GA4 + FB Pixel/CAPI.

## Plans (BDT, validate WTP)
- Free/Trial: 0 (14-day), subdomain only, 1 theme, capped orders.
- Starter: ~৳499–999, custom domain, all themes, courier + COD, unlimited products, order cap.
- Growth: ~৳1,999–2,999, funnels, advanced analytics, staff seats, higher caps.
- Pro: ~৳4,999+, priority support, API, A/B testing, no caps.
Collected via bKash/Nagad; auto-suspend on non-payment after grace; data retained 30 days.

## NFRs
Mobile-first (fast on low-end Android/3G, CWV budget); product/collection < 1.5s mobile; Bengali-first; idempotent payment/order writes; courier sync retried w/ backoff; PCI handled by gateways; secrets in vault; signed webhooks; 1→10k+ tenants on one codebase; per-tenant logs + audit trail.

## KPIs
Activation (live store + ≥1 product in 24h >60%); time-to-store <10 min; trial→paid >15%; logo churn <5%/mo after M3; tenant GMV (north-star); differentiator usage; MRR/ARPU (BDT).

## Open decisions
Brand = Hybrid (confirmed). First courier (Steadfast vs Pathao). bKash tier (checkout + billing). Apex domain. Themes (in-house vs commission, how many). Starter price validation (৳500–1000 sweet spot).
