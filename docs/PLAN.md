# PLAN — architecture & phases

> Pointer file. Canonical architecture lives below — do not duplicate here.

## Architecture
- System architecture → [docs/ARCHITECTURE.md](ARCHITECTURE.md)
- Phase blueprints → [docs/architecture/](architecture/) (phase0-blueprint, phase1-blueprint)
- Infra (self-hosted Supabase on VPS) → [docs/INFRA_SUPABASE.md](INFRA_SUPABASE.md)
- Deploy runbook → [docs/DEPLOY.md](DEPLOY.md)
- Scaling → [docs/SCALING_PLAN.md](SCALING_PLAN.md), [SCALING_PREP_SUMMARY.md](../SCALING_PREP_SUMMARY.md)
- Locked stack → [docs/STACK.md](STACK.md)

## Roadmap (from CLAUDE.md)
```
Phase 0 (DONE) — multi-tenant spine: withTenant RLS, host middleware, Doreja storefront, admin→ISR loop
Phase 1 (DONE) — sellable MVP: products CRUD, orders, COD + bKash(sandbox), Steadfast, SMS, billing, super-admin, signup
Phase 2 / M3 (DONE) — custom domains, theme catalog, visual customizer, COD reconciliation, analytics, WhatsApp
Infra (DONE 2026-06-25) — migrated backend to self-hosted Supabase on VPS (DB + GoTrue auth + MinIO storage)
Phase 3 — funnel builder, self-serve bKash billing, plan limits
Phase 4 — full section editor, multi-step funnels, scale hardening
```
