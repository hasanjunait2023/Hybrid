# Backlog

> Prioritized milestones. The CEO pops the top open item each LOOP iteration.
> Status: `todo` | `active` | `blocked` | `done`

## Active milestone
- [ ] M3: Phase 2 — Custom domains + themes + customizer + COD reconciliation — status: active
      + small adds from gap analysis: shipping rate calculator at checkout (Division→District→Thana + volumetric weight + auto COD-commission deduct) · Unicode Bangla SMS validation (reject Banglish, BTRC). Source: docs/research/roadmap-gap-plan.md.

## Queue (priority order)
- [ ] M3.5: Phase 2.5 — Regulatory + F-commerce wedge (BD-specific moat) — status: todo
      F-commerce automation (Meta Graph API comment-to-inbox + checkout link) · COD Fraud/Delivery Success Score · Escrow integration hook · DBID Compliance Wizard · SLA deadline timers + Bangla alerts. Source: docs/research/roadmap-gap-plan.md (gap analysis vs 2 market-research papers, 2026-06-24).
- [ ] M4: Phase 3 — Funnel builder + self-serve bKash billing — status: todo
      + freemium/low-tier pricing lock · ShurjoPay + AamarPay gateways · affiliate/agency partner program (see roadmap-gap-plan.md §3).
- [ ] M5: Phase 4 — Full editor, upsells, A/B, scale hardening — status: todo
      + merchant financing/capital advance once transaction history matures (see roadmap-gap-plan.md §3).

## Done
- [x] M2: Phase 1 — MVP Wedge — DONE 2026-06-23 (tag phase-1 @031f925; signup→live trial subdomain→COD+bKash checkout→Steadfast wire→billing→super-admin; gauntlet cleared 2 blockers+1 HIGH+4 majors+3 med; typecheck/lint 5/5, db 63/63, build OK; local-first, not pushed).
- [x] M1: Phase 0 — Foundation / Infra Spine — DONE 2026-06-23 (commit phase-0 tag 4f72e4d; DoD a/b/c/d all met; RLS 5/5).

## HARDEN blockers (M1)
- [x] SECURITY HIGH: parseDevCookie HMAC verify + prod refuse — FIXED (constant-time verify, getSession prod-guard, secret fail-fast).

## Tech debt (M1 → fix early M2)
- [ ] vitest globalSetup EBUSY teardown flake (Windows): force-kill embedded PG + retry rmdir + pre-run .pgtmp sweep so gate exit code is reliable locally. — source M1 QA
- [ ] ioredis: add .on('error') handler to silence "Unhandled error event" spam under Redis outage (degradation already works). — source M1 QA
- [ ] Phase-1 seams to honor: Supabase Auth swap behind getSession(); Upstash custom cache handler for revalidateTag across instances; de-hardcode app_runtime_login password + DEV_SESSION_SECRET fail-fast already done; host-header normalize/allowlist before internet exposure; theme-color Zod validation when theme editor ships. — source M1 security

## Infra / Ops (self-hosted Supabase, post-migration 2026-06-25)
- [x] **OFF-SITE BACKUPS** — DONE 2026-06-25. Nightly backup script now mirrors `/root/backups`
      (DB dumps + MinIO images) to **Cloudflare R2** bucket `hybrid-backups` via `mc mirror --remove`
      (cron 03:00). Survives full VPS loss. R2 creds in `/root/.r2-backup.env` (600, not in repo);
      repo copy of script at `infra/backup/hybrid-backup.sh`. Verified: dumps present in R2.
