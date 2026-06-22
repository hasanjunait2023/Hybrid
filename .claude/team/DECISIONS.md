# Decision Log

> Append-only. One dated entry per phase transition or notable call.
> This is the company's memory — it lets `/ceo` resume and the loop survive across sessions.

## 2026-06-23 — CHARTER — M1
- Decided: Chartered mission "Hybrid" (Shopify for Bangladesh). Brand renamed Ecomex → Hybrid. Persisted source docs to `docs/` (PRD, BUILD_CHECKLIST, 01_schema.sql, 02_policies.sql). Created team scaffold. Active milestone M1 = Phase 0 spine.
- Why: Founder invoked /ceo with PRD + schema + policies + checklist. Goal is clear; phased roadmap already defined — adopt it as milestone backlog M1–M5.
- Dispatched: (none yet) — proceeding to gate questions then RESEARCH/PLAN.
- Outcome: Scaffold complete. Asking founder 4 sharp questions that shape the Phase-0/Phase-1 plan before GATE 1.

## 2026-06-23 — RESEARCH — M1
- Decided: Founder gate answers — full-vision scope (loop M1→M5), local-first infra, Steadfast courier, root domain myhybrid.com placeholder. Dispatching focused RESEARCH to de-risk Phase 0 critical path before PLAN.
- Why: Phase-0 spine is well-trodden (Turborepo + Next.js multi-tenant + Supabase RLS) but the withTenant() session-variable RLS layer + connection pooling (pgBouncer transaction mode vs set_config(...,true)) has sharp edges that, if wrong, silently break tenant isolation. De-risk now.
- Dispatched: researcher — Phase-0 critical patterns (withTenant + pooling + RLS session var, Next.js host-based middleware, local-first Postgres for RLS roles).
- Outcome: pending researcher return.

## 2026-06-23 — PLAN — M1
- Decided: RESEARCH complete (docs/research/phase0-brief.md). Key outcomes: (1) BLOCKING DEFECT in 02_policies.sql — app_runtime is NOLOGIN, cannot be connected as; fix via app_runtime_login LOGIN role inheriting app_runtime grants. (2) withTenant() = postgres.js sql.begin + set_config(...,true) inside, prepare:false. (3) local-first: lvh.me + docker postgres:16-alpine. (4) RLS proven via app-level Vitest integration tests in CI.
- Why: De-risked the make-or-break tenant-isolation layer before committing to a design.
- Dispatched: ceo-architect (Phase 0 blueprint, must resolve open risks: app.current_user_id GUC, signup provisioning via asPlatformAdmin, order_counter trigger under RLS) + designer (DESIGN.md — Hybrid brand, Bengali-first + mobile-first system).
- Outcome: pending. Then synthesize → GATE 1.

## 2026-06-23 — GATE1 — M1
- Decided: PLAN complete. Architect delivered buildable Phase-0 blueprint (Turborepo; @hybrid/db withTenant; 00_roles.sql + 04_grant_login.sql bookends fixing NOLOGIN defect, canonical 01/02/03 untouched; kysely-codegen types; local auth stub w/ permanent getSession() seam; middleware host→tenant→/_sites/[tenant]; unstable_cache per-tenant tags; 5-test Vitest RLS CI gate; local-first docker postgres+redis+lvh.me). All brief open-risks resolved (withTenant takes userId; signup via asPlatformAdmin; order_counter under RLS proven; prepare:false). Designer delivered DESIGN.md "Bazaar Modern"/theme "Doreja" — trust-first, Bangla-first (Hind Siliguri), light-mode, COD-green, Bangla numerals on storefront, sticky action bar; dark mode scoped out of P0/1.
- Why: De-risked + locked the make-or-break isolation layer and the design bar before any code.
- Dispatched: ceo-architect + designer (parallel).
- Outcome: Parked at GATE 1 — presenting plan to founder for approval before BUILD.
