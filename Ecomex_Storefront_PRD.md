# Product Requirements Document — Multi-Tenant Commerce Platform
### Working name: **Ecomex Storefront** (a "Shopify for Bangladesh")

| | |
|---|---|
| **Owner** | Junait |
| **Status** | Draft v0.1 — for review |
| **Last updated** | 2026-06-22 |
| **Target market** | Bangladesh e-commerce + F-commerce sellers |
| **Type** | Multi-tenant SaaS (store builder + storefront + funnel builder + super-admin) |

> ⚠️ **Scope warning (read first).** This document describes the *full vision*. Building all of it is a multi-year effort (Shopify took a large team a decade). For a solo founder, the only sane path is the **phased roadmap in §13** — ship a sharp MVP wedge first, prove revenue, then expand. Treat §6–§12 as the destination, not the v1 build list.

---

## 1. Executive Summary

Ecomex Storefront is a multi-tenant SaaS that lets any Bangladeshi seller spin up a complete online store — **admin backend + customer-facing storefront** — in minutes, choose from pre-built themes, connect their own domain, and build fully-customizable landing pages / sales funnels, all without writing code or hiring a developer.

It is a **localized Shopify alternative** purpose-built for the realities of the Bangladesh market: Bengali-first UX, **bKash/Nagad/SSLCommerz + Cash-on-Delivery** as first-class payment paths, native **courier integration** (Steadfast, Pathao Courier, RedX, Paperfly) with COD reconciliation, mobile-first storefronts, and a price point payable in BDT via bKash.

The platform has four product surfaces:
1. **Tenant Admin** — the seller's backend (products, orders, customers, courier, payments, analytics).
2. **Tenant Storefront** — the seller's live website, rendered from a chosen theme; edits in the admin appear instantly on the storefront (no separate site-building).
3. **Theme + Landing/Funnel Builder** — pick a theme, customize it visually, and build CartFlows-style landing pages and checkout funnels.
4. **Platform Super-Admin + Marketing Site** — the owner's control panel to manage all tenants, billing, and plan limits, plus the public marketing landing page that sells the SaaS itself.

---

## 2. Problem & Market Opportunity

**The market is large and overwhelmingly informal.**
- Bangladesh e-commerce GMV crossed **~$3B in 2025**, trending toward **~$4B by end of 2026**, growing 25–30% annually (industry estimates, 2025–2026).
- **~300,000+ sellers** use Facebook pages as their *primary* storefront — one of the world's largest F-commerce ecosystems. Most run their entire business out of Messenger inbox, comments, and a notebook.
- **~78% of transactions are on mobile** (highest mobile-commerce rate in South Asia).
- **COD dominates (~70–75%)**; bKash processes **$30B+/year** and is the backbone of digital payments.
- Most F-commerce owners earn **BDT 10,000–100,000/month** — small, price-sensitive, non-technical.

**The pain.** These sellers have no real website. They lose orders in Messenger, can't track COD remittance across 3–4 couriers, can't run a professional checkout, and look untrustworthy to buyers. The "graduation path" from a Facebook page to a real store is broken:
- **Shopify** is excellent but expensive (USD pricing), not Bengali-native, has no native bKash/COD/courier flow, and is overkill for a 50-order/month seller.
- **WooCommerce** requires hosting, a developer, and ongoing maintenance — out of reach for the target user.
- **Local builders** (e.g. Bitcommerz, and various agency-built sites) exist but are mostly thin, template-only, or service-shop deliveries — weak on funnels, courier reconciliation, and a true self-serve multi-tenant SaaS experience.

**The wedge.** A self-serve, Bengali-first, mobile-first store builder where COD + bKash + courier reconciliation are *native, not bolted on*, priced in BDT — aimed squarely at the F-commerce seller ready to look professional. That specific combination is under-served.

---

## 3. Competitive Landscape & Positioning

| Competitor | Strength | Gap we exploit |
|---|---|---|
| **Shopify** | Best-in-class product, themes, app ecosystem | USD pricing, no native bKash/COD/courier, not Bengali, overkill for micro-sellers |
| **WooCommerce / WordPress** | Free, infinitely customizable | Needs hosting + developer + maintenance; not self-serve |
| **Wix / Ecwid** | Easy drag-drop | Weak on BD payments/courier; generic |
| **Bitcommerz & local builders** | Local presence, BD payments | Limited funnel/CRO tooling, weaker COD reconciliation, less true self-serve SaaS depth |
| **GemPages / CartFlows** (page/funnel builders) | Strong landing pages | Are *add-ons* to Shopify/WP, not a standalone BD platform |
| **Dukaan / Bikayi** (India analogs) | Proven "store-in-a-tap" model | Not localized for BD couriers/payments/Bengali |

**Positioning statement:** *"From Facebook page to professional store in 10 minutes — built for Bangladesh. bKash, COD, and courier reconciliation that just work, in Bangla, priced in Taka."*

**Defensible differentiators (the moat):**
1. **COD + multi-courier reconciliation** as a core feature (real money-leakage problem; see §6.1).
2. **Bengali-first** storefront + admin + support.
3. **Funnel/landing builder** included (not a paid add-on) — high-converting single-product "order form" pages that F-commerce sellers love.
4. **bKash-native billing** for the SaaS subscription itself (removes the card-payment barrier that blocks Shopify adoption).

---

## 4. Target Users / Personas

**P1 — Rؤনু, the F-commerce seller (primary).** Runs a clothing/cosmetics page on Facebook, 30–300 orders/month, takes orders in Messenger, ships via Steadfast/Pathao. Non-technical, mobile-only, wants to look professional and stop losing orders. *Core wedge user.*

**P2 — Arif, the growing e-commerce SME.** Already has 500–3,000 orders/month, maybe a WooCommerce site he hates maintaining. Wants reliability, courier reconciliation, analytics, and a faster checkout. *Expansion user / higher ARPU.*

**P3 — The dropshipper / single-product marketer.** Runs Facebook ads to a single-product landing page with an order form. Lives and dies by funnel conversion. *Heavy user of the funnel builder.*

**P4 — Junait, the platform owner (you).** Needs a super-admin to onboard/manage tenants, set plan limits, handle billing, monitor health, and a marketing site to acquire tenants.

---

## 5. Goals & Non-Goals

### 5.1 Goals
1. A seller can self-onboard and have a live, themed storefront on a `*.myecomex.com` subdomain in **< 10 minutes**.
2. Connect a **custom domain** with automatic SSL in a few guided steps.
3. **Admin edits reflect on the storefront immediately** — one source of truth, no separate website build.
4. Native **bKash / Nagad / SSLCommerz / COD** checkout.
5. Native **courier dispatch + COD reconciliation** across major BD couriers.
6. A **theme picker + visual customizer** and a **landing/funnel builder**.
7. A **super-admin** to manage tenants, plans, and billing in BDT via bKash.
8. **Hard tenant isolation** (one tenant can never read another's data) enforced at the database layer.

### 5.2 Non-Goals (at least for v1–v2)
- Not building an app marketplace / third-party app SDK.
- Not a multi-vendor *marketplace* (like Daraz) — this is single-merchant stores.
- Not replacing accounting/ERP; integrate later.
- Not international/multi-currency at launch (BDT-first).
- Not a full drag-anything-anywhere page editor in v1 (constrained section editor first — see §13).

---

## 6. Product Scope — The Four Surfaces

### 6.1 Surface A — Tenant Admin (the seller's backend)

| Module | v1 requirements |
|---|---|
| **Dashboard** | Today's orders, revenue, COD pending, low-stock, traffic snapshot |
| **Products** | CRUD, variants (size/color), images, inventory, categories/collections, pricing, SKU |
| **Orders** | Order list/detail, status pipeline (pending → confirmed → packed → shipped → delivered → returned), manual order entry (for Messenger orders), invoice/print |
| **Customers** | Customer list, order history, phone/address book, basic notes |
| **Payments** | Configure bKash/Nagad/SSLCommerz/COD; view settlements |
| **Courier & COD reconciliation** ⭐ | Connect Steadfast/Pathao/RedX/Paperfly; push orders to courier; pull delivery status; **reconcile COD collected vs remitted; flag discrepancies** (the differentiator) |
| **Discounts** | Coupon codes, % / fixed / free-shipping, min-cart rules |
| **Storefront settings** | Theme selection, customization (see Surface C), pages (about/contact/policy), navigation menus |
| **Domain** | Subdomain by default; guided custom-domain connect |
| **Analytics** | Sales over time, top products, conversion funnel, traffic sources, Facebook Pixel/Conversions API + GA4 |
| **Notifications** | Order SMS/WhatsApp/email to customer; new-order alert to seller |
| **Settings** | Store profile, VAT/Mushak fields (optional), staff/roles (later) |

### 6.2 Surface B — Tenant Storefront (the live website)

- **Theme-rendered, server-side** Next.js storefront resolved by hostname (subdomain or custom domain).
- **Mobile-first** (78% of traffic), fast (ISR/edge caching), Bengali default with English toggle.
- Pages: home, collection/category, product detail, cart, **checkout (COD + bKash + Nagad + SSLCommerz)**, order-success/track, static pages.
- **bKash/COD-optimized checkout**: phone-first, address with division/district/thana pickers, minimal fields, COD as default option, OTP optional.
- SEO basics, Open Graph for Facebook sharing, "Order on WhatsApp/Messenger" fallback button.
- **Key contract:** the storefront is a *pure renderer* of tenant data + theme config from the DB. Any admin change (product, price, theme color, page section) is reflected on the next request — no rebuild, no separate publishing of a "website."

### 6.3 Surface C — Theme System + Visual Customizer

- **Theme = a set of React "sections"** (Hero, Featured Products, Product Grid, Banner, Testimonials, Countdown, FAQ, Footer, etc.) plus a **JSON settings schema** (colors, fonts, logo, layout toggles).
- Seller flow: **pick a theme → customize via a settings panel → (later) rearrange sections → save**. Saved customization is stored as **JSON config per tenant** (`theme_settings`); the storefront reads it at render time.
- **v1 = constrained customizer**: choose theme, edit global settings (logo, colors, fonts, hero content, featured collections), reorder/toggle a fixed set of homepage sections. **No free-form drag-drop yet.**
- **v2 = section-based editor** (Shopify "Online Store 2.0" model): add/remove/reorder sections per page with per-section settings, live preview.
- Ship **3–5 high-quality themes** at launch (fashion, cosmetics, electronics, general, single-product) rather than many mediocre ones.

### 6.4 Surface D — Landing Page / Funnel Builder (CartFlows-style) ⭐

- Build standalone **landing pages and order funnels** (especially single-product "buy now" pages for Facebook-ad traffic).
- **Block-based builder**: hero, product showcase, benefits, social proof/reviews, countdown/scarcity, embedded **order form**, FAQ, sticky buy button.
- **Funnel steps**: Landing → Order form (COD/bKash) → Upsell/bump (later) → Thank-you/track.
- Fully customizable copy, colors, images per page; publishable to a path (`/lp/summer-offer`) or its own domain.
- **v1 = template-driven** single-product order-form pages with editable blocks; **v2 = full block editor + multi-step funnels + A/B testing + order bumps/upsells.**

### 6.5 Surface E — Platform Super-Admin (owner panel)

- Tenant directory: list, search, status (active/trial/suspended), plan, usage (orders, products, domains).
- **Subscription & billing**: plans, limits, invoices, **bKash/Nagad subscription collection**, trials, dunning/suspension.
- Provisioning: create/suspend/delete tenants; impersonate (support); reset.
- Plan-limit enforcement (products, orders/month, custom domains, staff seats).
- Theme/template management (publish new themes to the catalog).
- Platform analytics: MRR, churn, active stores, GMV across tenants, support load.
- Feature flags / kill switches per tenant.

### 6.6 Surface F — Marketing Landing Page (the SaaS's own site)

- Public site selling the platform: value prop, pricing (BDT), theme showcase, live demo store, signup CTA, Bengali content.
- Blog/SEO for organic acquisition ("কীভাবে Facebook পেজ থেকে ওয়েবসাইট বানাবেন").
- Signup → tenant provisioning flow.

---

## 7. Technical Architecture

### 7.1 Multi-tenancy model — **shared database + Row-Level Security (RLS)**
- **Single Postgres (Supabase)**, every tenant-scoped table carries `tenant_id`. RLS policies enforce isolation so a query can only ever see its own tenant's rows. (Database-per-tenant is rejected — operational nightmare at scale.)
- At request start, set the tenant context as a Postgres session variable:
  ```sql
  SELECT set_config('app.current_tenant_id', '<uuid>', true);
  ```
  RLS policies read `current_setting('app.current_tenant_id')` to filter every row automatically. This is the same proven pattern as your Video Factory build.
- This is the **single most important security contract** — see §11.4. RLS policies are a separate, reviewed deliverable.

### 7.2 Hosting & custom domains — **Vercel for Platforms**
- One Next.js deployment serves **all** tenants. Vercel for Platforms (GA Dec 2025) provides **wildcard subdomains** (`*.myecomex.com`) and **custom domain attachment with automatic SSL** in seconds, removing the hardest infra problem (per-tenant DNS + TLS).
- Custom-domain onboarding: tenant adds domain in admin → we add it via Vercel Domains API → show DNS records (A/CNAME) → verify → auto-SSL.
- Alternative/backup: **Cloudflare for SaaS** (Custom Hostnames) if we ever self-host the renderer or want CDN/WAF control.

### 7.3 Storefront resolution — **Next.js middleware by hostname**
- `middleware.ts` reads the `host` header → looks up the tenant (cached in Redis/Edge) → rewrites internally to `/_sites/[tenant]/...`. The browser URL never changes.
- Rendering: **SSR + ISR** for storefront pages (cache product/collection pages, revalidate on change) for speed on mobile + cheap scaling. Cache invalidation on admin edits (on-demand revalidation).
- Theme + `theme_settings` JSON loaded per request (cached) → sections rendered dynamically. **This is what makes "admin edit → instant storefront update" work without per-tenant builds.**

### 7.4 Theme engine — **JSON-driven sections**
- Each theme registers a set of section components and a settings schema (think Shopify OS 2.0 JSON templates).
- Tenant customization persisted as JSON (`pages`, `sections`, `blocks`, `settings`). Storefront walks the JSON tree and renders the corresponding React sections. No code is generated per tenant.

### 7.5 Funnel builder
- Same JSON-block model as the theme engine, but for standalone pages. A `landing_pages` table holds the block tree + funnel-step config. Rendered by the same storefront app under `/lp/[slug]` or a mapped domain.

### 7.6 Payments
- **Gateways**: bKash (PGW), Nagad, SSLCommerz (aggregates cards + MFS), **COD**.
- Abstraction: a `PaymentProvider` interface so gateways are pluggable; webhooks for payment confirmation; idempotent order-payment state machine.
- **SaaS subscription billing** uses bKash/Nagad recurring or manual top-up + grace period (BD users rarely have cards).

### 7.7 Courier integration & COD reconciliation ⭐
- Adapters for **Steadfast, Pathao Courier, RedX, Paperfly** (REST APIs): create consignment, fetch status, fetch COD remittance reports.
- Reconciliation engine: match `order.cod_amount` ↔ courier "collected" ↔ courier "remitted to merchant"; surface discrepancies, delays, and pending payouts. This is a top-tier differentiator and a sticky, money-saving feature.

### 7.8 Stack summary (aligned to your existing stack)
| Layer | Choice |
|---|---|
| Storefront + Admin UI | **Next.js (App Router)** on **Vercel for Platforms** |
| Auth | Supabase Auth (tenant membership in JWT/claims) |
| DB | **Supabase Postgres + RLS**; Redis (Upstash) for tenant/host cache + sessions |
| Heavy/async logic | **FastAPI** service (courier sync, reconciliation jobs, exports) + queue; or Modal for batch jobs |
| Files/media | Supabase Storage / S3-compatible + image CDN |
| Payments | bKash, Nagad, SSLCommerz, COD adapters |
| Couriers | Steadfast, Pathao, RedX, Paperfly adapters |
| Notifications | SMS gateway (BD), WhatsApp Cloud API, email |
| Automation | n8n (`n8n.myecomex.com`) for workflows/integrations |
| Analytics | GA4 + Facebook Pixel/CAPI + internal events |

---

## 8. Data Model — key entities (sketch)

> All tenant-scoped tables carry `tenant_id uuid` + RLS. UUID PKs, `timestamptz` in UTC, money `numeric(14,2)`.

- **tenant** (id, name, slug/subdomain, plan_id, status, owner_user_id, created_at)
- **tenant_domain** (id, tenant_id, domain, type[subdomain|custom], ssl_status, verified)
- **user** + **tenant_member** (tenant_id, user_id, role[owner|staff])
- **product** (tenant_id, title, description, status, …) + **product_variant** (price, sku, inventory, options)
- **collection** / **product_collection**
- **order** (tenant_id, customer, totals, payment_status, fulfillment_status, cod_amount, courier_id, consignment_id) + **order_item**
- **customer** (tenant_id, name, phone, addresses)
- **payment** (tenant_id, order_id, provider, status, txn_id, amount)
- **courier_account** (tenant_id, provider, credentials) + **shipment** (status, cod_collected, cod_remitted, reconciled)
- **theme** (catalog) + **tenant_theme_settings** (tenant_id, theme_id, settings_json)
- **page** / **landing_page** (tenant_id, slug, blocks_json, status)
- **discount** (tenant_id, code, type, value, rules)
- **plan** (limits) + **subscription** (tenant_id, plan_id, status, period, bkash_ref) + **invoice**
- **event** (analytics) — tenant_id, type, payload

(A full PostgreSQL DDL + RLS policy file is a natural next deliverable — same structure as your Video Factory `01_schema.sql` / `02_policies.sql`.)

---

## 9. Subscription, Plans & Billing (BDT)

Indicative tiers (numbers to validate against willingness-to-pay):

| Plan | Target | Price (BDT/mo) | Limits |
|---|---|---|---|
| **Free / Trial** | New F-sellers | 0 (14-day) | Subdomain only, 1 theme, capped orders |
| **Starter** | Small F-commerce | ~৳499–999 | Custom domain, all themes, courier + COD, unlimited products, order cap |
| **Growth** | Scaling SME | ~৳1,999–2,999 | Funnels, advanced analytics, staff seats, higher caps |
| **Pro** | High volume | ~৳4,999+ | Priority support, API, A/B testing, no caps |

- Collected via **bKash/Nagad** (recurring or manual + grace). Auto-suspend storefront on non-payment after grace; data retained 30 days.

---

## 10. Non-Functional Requirements

- **Mobile-first**: storefront must be fast and flawless on low-end Android over 3G/4G; Core Web Vitals budget enforced.
- **Performance**: storefront pages cached (ISR/edge); product/collection pages < 1.5s on mobile.
- **Bengali-first**: full Bengali UI for admin + storefront; correct Bengali typography/numerals where appropriate.
- **Reliability**: payment + order writes idempotent; courier sync retried with backoff.
- **Security**: see §11.4 (RLS), PCI handled by gateways (we never store card data), secrets in vault, signed webhooks.
- **Scalability**: 1 → 10,000+ tenants on one codebase; tenant/host lookups cached at edge.
- **Observability**: per-tenant logs, error tracking, audit trail on admin actions.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Scope explosion** (building "all of Shopify") | Strict phasing (§13); MVP wedge only |
| **Visual editor + funnel builder are very hard** | v1 = constrained settings/template editor, not drag-anything; expand later |
| **Tenant data leak via RLS bug** | RLS as first-class deliverable; automated isolation tests; deny-by-default |
| **COD fraud / fake orders** | Order verification, repeat-fraud blocklist by phone, optional OTP |
| **Courier API instability/changes** | Adapter pattern, graceful degradation, manual fallback |
| **bKash recurring billing friction** | Manual top-up + grace; clear dunning; annual prepay discount |
| **Facebook policy / Messenger reliance** | Position as *graduation off* Facebook dependency; don't build on unstable Messenger APIs in v1 |
| **Custom-domain support burden** | Lean on Vercel for Platforms automation; guided UX; status checks |
| **Price sensitivity** | Free tier + low Starter price; prove ROI via COD reconciliation savings |
| **Infra cost per free tenant** | Caching, ISR, plan caps, suspend idle free stores |

---

## 12. Success Metrics (KPIs)

- **Activation:** % of signups with a live storefront + ≥1 product within 24h (target > 60%).
- **Time-to-store:** median minutes signup → live store (target < 10).
- **Paid conversion:** trial → paid (target > 15%).
- **Retention:** logo churn < 5%/mo after month 3.
- **Tenant GMV:** total GMV processed across stores (north-star).
- **Differentiator usage:** % of tenants using courier reconciliation + funnels.
- **MRR / ARPU** in BDT.

---

## 13. Phased Roadmap (the realistic build plan)

> Each phase should be independently shippable and revenue-generating. Do **not** start Phase 2 before Phase 1 has real paying tenants.

### **Phase 0 — Foundation (infra spine)**
Multi-tenant skeleton: Supabase + RLS, tenant/host middleware on Vercel for Platforms, subdomain provisioning, auth + tenant membership, one hardcoded theme rendering tenant data. **Goal: prove "admin edit → storefront update" + isolation works end-to-end.**

### **Phase 1 — MVP wedge (sell this)**
- Products, orders (incl. manual entry), customers, basic dashboard.
- **One excellent mobile storefront theme** + checkout with **COD + bKash**.
- **One courier integration (Steadfast or Pathao)** + basic order push & status.
- Subdomain stores; super-admin (tenant list, manual plan); marketing landing page.
- bKash-based manual subscription.
- **MVP differentiator:** simplest version of COD tracking.
> *Outcome: a real seller can run their business on it. Charge money.*

### **Phase 2 — Custom domains + themes + customizer**
- Custom domain connect (Vercel API) + auto-SSL.
- 3–5 themes + **constrained visual customizer** (settings/sections, no free drag).
- Discounts, more couriers, **COD reconciliation engine** (full differentiator).
- Notifications (SMS/WhatsApp), analytics + Pixel/CAPI.

### **Phase 3 — Funnel builder + self-serve billing**
- Template-driven **landing/funnel pages** (single-product order forms).
- Self-serve plans + automated bKash/Nagad subscription + dunning.
- Staff roles, plan-limit enforcement.

### **Phase 4 — Depth & scale**
- Full section-based theme editor (OS 2.0 style) + multi-step funnels, A/B tests, order bumps/upsells.
- Advanced analytics, abandoned-cart recovery, app/integration framework.
- Performance hardening at thousands of tenants.

---

## 14. Open Questions / Decisions Needed

1. **Product name & brand** — keep "Ecomex" umbrella or a new consumer brand for the store builder?
2. **First courier** for Phase 1 — Steadfast vs Pathao (which API + which has most seller demand)?
3. **bKash integration tier** — which bKash product (PGW vs Tokenized vs merchant) for both *storefront checkout* and *SaaS billing*?
4. **Build vs adapt** — start from the Vercel Platforms Starter Kit, or your own Next.js base? (Recommend: study the kit, build your own spine to avoid lock-in.)
5. **Themes** — design in-house or commission? How many at launch?
6. **Pricing** — validate Starter price against F-seller willingness-to-pay (likely ৳500–1,000 is the psychological sweet spot).
7. **Reuse** — how much of existing Ecomex (communication infra) and your Supabase/RLS patterns can be lifted directly?

---

### Appendix A — Why this can win (one-paragraph thesis)
300,000+ Facebook sellers need to graduate to a real store, but every existing option is either too expensive/foreign (Shopify), too technical (WooCommerce), or too shallow (local template shops). A Bengali-first, mobile-first, **self-serve** platform where **COD + bKash + courier reconciliation are native** and a **funnel builder is included**, priced in Taka and billed via bKash, hits a large, growing, under-served market with a defensible local moat. The infrastructure that used to make this a huge undertaking (per-tenant domains + SSL, multi-tenant isolation) is now largely solved by **Vercel for Platforms + Supabase RLS** — which is exactly your stack.
