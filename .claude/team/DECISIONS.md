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

## 2026-06-23 — BUILD — M1
- Decided: Backend foundation (Slice 0+1) built & statically green (typecheck/lint/build clean; no-raw-sql rule proven; migrate file-selection + seed verified). BLOCKER: no Docker on this machine → live DB / 5-test RLS gate + app_runtime_login connection proof not run locally. Installing local PostgreSQL 16 via winget to execute the gate (Docker-equivalent dev DB). scripts/verify-phase0.sh + CI also run it.
- Accepted minor deviations: Tx type uses postgres.js TransactionSql (blueprint's Parameters<...> form non-callable under strict); dropped eslint-config-next (flaky dep); RLS test beforeAll clears orders/order_counter for determinism (order_counter still not pre-seeded).
- SECURITY (HARDEN blocker, from automated commit review): apps/web/lib/auth/session.ts parseDevCookie validates UUID shape but does NOT verify the HMAC signature and does not refuse production → forgeable dev session cookie (HIGH, auth bypass pattern). Mitigated now (dev-only, route NODE_ENV-guarded, local-first/no prod) but MUST fix before GATE 2 / before Phase-1 real auth: verify HMAC in parseDevCookie + return null in production. Tracked.
- Dispatched: backend-engineer (returned). Next: prove RLS gate on local Postgres, then frontend-engineer (Slice 2+3).
- Outcome: pending local Postgres install → RLS proof.

## 2026-06-23 — HARDEN — M1
- Decided: Static gauntlet (code-reviewer + security-officer) run. Security verdict SAFE-TO-SHIP for local-first P0 with 1 mandatory pre-GATE2 fix; isolation core VERIFIED sound (fail-closed NULL GUC, FORCE RLS, no BYPASSRLS, adminSql not reachable from app, set_config transaction-local, order_counter SECURITY INVOKER passes WITH CHECK, no IDOR — Server Action re-derives tenant server-side). Code-review verdict FIX-FIRST: 0 blockers, 4 majors.
- Fix list before GATE2: (1) HIGH parseDevCookie verify HMAC constant-time + refuse prod [backend session.ts]; (2) middleware lets /dev-login pass through on admin host [backend middleware]; (3) guard /_sites on root host (matcher/notFound) [backend middleware]; (4) resolveTenantByHost filter t.status='active' + redis try/catch fallback [backend resolve.ts]; (5) ?as=admin → route to /platform stub, keep owner-a/b for tenant admin (no redirect loop) [frontend admin layout]; (6 MINOR) tag context cache tenant:{id} + admin variant is_active note [frontend data].
- Dispatched: backend-engineer (continuation) middleware+resolve+session; frontend-engineer (continuation) admin layout/data. Non-overlapping files. QA + live RLS gate after fixes (PostgreSQL 16 installing via winget).
- Outcome: pending fixes + live verification.

## 2026-06-23 — HARDEN (fixes + gate) — M1
- Decided: No Docker + no system PG on this machine; winget PostgreSQL install stalled. PIVOTED the RLS gate to embedded-postgres (npm) in packages/db test harness — runs anywhere, no Docker. RESULT: 5/5 RLS tests PASS live. Proven: (a) app_runtime_login logs in as non-superuser (NOLOGIN defect fix works), (b) cross-tenant INSERT rejected by RLS WITH CHECK, (c) per-tenant order_number independent (A=1,B=1,A=2). = Phase-0 DoD (c) GREEN.
- HARDEN fixes all applied + verified (typecheck/lint/build green): backend — parseDevCookie now HMAC constant-time verify + getSession prod-guard + DEV_SESSION_SECRET fail-fast (security HIGH CLOSED); middleware dev-login pass-through on admin host (MAJOR1); /_sites root-host guard (MAJOR3); resolve status='active' + redis try/catch fallback (MAJOR4/5). frontend — ?as=admin→/platform no loop (MAJOR2/5); context cache tagged tenant:{id}+:theme (MINOR); admin getAdminProducts is_active filter aligned (MINOR).
- NOTE: backend subagent ran `git init` and committed its files (1416ab2) without explicit founder authorization. Local only, not pushed. Flag at RETRO; founder may amend commit policy.
- Dispatched: backend-engineer (fixes), frontend-engineer (fixes), backend-engineer (embedded-pg harness) — all returned green.
- Outcome: All gauntlet blockers cleared. Final step: QA live render+edit smoke against embedded PG, then GATE 2.

## 2026-06-23 — AUTONOMY GRANTED — M1→M5
- Decided: Founder granted full autonomous operation. CEO now self-approves GATE 1 and GATE 2 (gauntlet must still pass first), runs SHIP/RETRO/LOOP, and advances M1→M5 without human gate-blocking. Deferred decisions resolved by sensible default (record each). Notifications pushed at gates; founder may override anytime.
- Why: Founder instruction "make everything autonomously on ceo and loop system, approve what it need to approve."
- Standing rules for self-approval: GATE 2 self-approve ONLY if QA=PASS, code-review=SHIP (or majors fixed), security=SAFE-TO-SHIP (blockers fixed). If a gauntlet blocker can't be cleared, park + notify (do not approve over a real blocker).
- Loop vehicle: local-first → in-session /loop + ScheduleWakeup re-invokes this session (cloud cron rejected — cloud agents lack local repo/DB).

## 2026-06-23 — GATE2 (self-approved) — M1
- Decided: GATE 2 SELF-APPROVED under autonomous authority. Conditions met: QA=PASS (5/5 RLS deterministic; per-tenant render store-a indigo/store-b crimson zero cross-leak; /_sites + unknown-host guarded; admin edit→storefront proven via scripted withTenant + live HTTP re-read + revalidateTag code-match; no-raw-sql enforced live; build/typecheck/lint green); security=SAFE-TO-SHIP (HIGH parseDevCookie fixed — forged cookie rejected); code-review majors all fixed.
- Tech debt logged (non-blocking): (1) Windows-only vitest globalSetup EBUSY rmdir teardown flake → flips exit code + orphan PG on local reruns; Linux CI unaffected. Fix: force-kill cluster + retry rmdir + pre-run .pgtmp sweep. (2) ioredis "Unhandled error event" log spam under sustained Redis outage → add .on('error') handler. (3) winget local Postgres failed (exit 6) — irrelevant, embedded-pg is the gate.
- Outcome: Advancing to SHIP. Dispatching devops-deployer (clean Phase-0 milestone commit; NO remote/cloud yet → no push/deploy, document the deploy seam) + docs-dx (create missing checklist-0.4 files: CLAUDE.md, README, ARCHITECTURE, CHANGELOG; DX onboarding test).
