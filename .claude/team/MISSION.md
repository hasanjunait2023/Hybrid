# Mission Charter

> Written at CHARTER. The sacred source of intent. Every agent reads this first.

- **Project:** Hybrid — multi-tenant SaaS commerce platform ("Shopify for Bangladesh")
- **Chartered:** 2026-06-23
- **CEO run:** /ceo

## Goal
Build Hybrid: a Bengali-first, mobile-first multi-tenant store builder for Bangladeshi F-commerce sellers, where bKash/Nagad/SSLCommerz + COD + courier reconciliation are native. Each seller gets admin backend + live themed storefront on a subdomain (later custom domain), funnel builder, billed in BDT via bKash. Hard tenant isolation enforced at the DB layer (Supabase Postgres RLS via `app.current_tenant_id`).

Source docs: `docs/PRD.md`, `docs/BUILD_CHECKLIST.md`, `docs/01_schema.sql`, `docs/02_policies.sql`.

## Success criteria (how we know it's done)
Per-phase DoD drives this. Top-level:
- [ ] **Phase 0 (M1):** Tenant on a subdomain renders a themed store from real DB data; admin edit reflects on storefront without rebuild; RLS isolation test suite green in CI; `withTenant()` is the only tenant data path (no raw access).
- [ ] **Phase 1 (M2):** A new seller self-signs up → live subdomain store → adds products → takes a COD/bKash order → ships via one courier → gets paid. No stubs in shipped paths.
- [ ] **Phase 2 (M3):** Custom domain + SSL; theme picker + constrained customizer; discounts; COD reconciliation flags a real discrepancy; Pixel/CAPI firing.
- [ ] **Phase 3 (M4):** Single-product funnel takes orders; self-serve bKash subscription billing + dunning; plan limits enforced.
- [ ] **Phase 4 (M5):** Full section editor; multi-step funnels + upsells + A/B; scale hardening.

## Constraints (LOCKED stack)
- Framework: Next.js (App Router), TypeScript strict, latest stable. Monorepo: Turborepo.
- DB: Supabase Postgres + RLS via `app.current_tenant_id` session var. Runtime DB access ONLY through `withTenant()` as `app_runtime` role (not service role / superuser).
- Hosting/domains: Vercel for Platforms (wildcard subdomains + custom domains + auto-SSL).
- Cache: Upstash Redis. Async/heavy: FastAPI service + queue.
- Styling: Tailwind + shadcn/ui. Payments: bKash/Nagad/SSLCommerz/COD. Couriers: Steadfast/Pathao/RedX/Paperfly.
- Guardrails: no stubs/mocks in shipping code; secrets encrypted (`APP_ENCRYPTION_KEY`/Vault), never plaintext; webhooks signature-verified + idempotent; mobile-first + Bengali-first are acceptance criteria.

## Non-goals (v1–v2)
App marketplace/SDK; multi-vendor marketplace; accounting/ERP; multi-currency at launch (BDT-first); free-form drag-anything page editor in v1 (constrained section editor first).

## Stakeholder decisions
- 2026-06-23: Brand name = **Hybrid** (confirmed by founder).
- 2026-06-23: Run scope = **Everything (Phase 0→4)** — CEO loops milestone-by-milestone M1→M5, gating each.
- 2026-06-23: Infra = **local-first**. Build/test against local Docker Postgres; cloud (Supabase/Vercel/Upstash) env vars stubbed in `.env.example`, wired later. Local subdomain testing via `lvh.me`/`*.localhost`.
- 2026-06-23: Phase-1 first courier = **Steadfast**. Adapter interface stays generic for the others.
- 2026-06-23: Root domain = **myhybrid.com** (placeholder, `NEXT_PUBLIC_ROOT_DOMAIN`), swap later.
- (pending) bKash product tier for checkout + SaaS billing — decide at Phase 1.
- 2026-06-23: **AUTONOMOUS MODE authorized by founder.** CEO self-approves GATE 1 + GATE 2 (no human block), loops M1→M5 continuously, makes sensible default calls on deferred items (bKash tier, courier already=Steadfast, pricing placeholders), and records every gate decision in DECISIONS.md + pushes a notification. Founder can interrupt/override anytime. Local-first project → loop driven by in-session /loop + ScheduleWakeup (not cloud cron). Bias: keep the founder's goal sacred, cut speculative scope, run the harden gauntlet before every self-approved gate.
