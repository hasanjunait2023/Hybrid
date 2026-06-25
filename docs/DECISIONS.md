# DECISIONS

> Pointer file. The authoritative decisions log is **[.claude/team/DECISIONS.md](../.claude/team/DECISIONS.md)**
> (46KB — every architectural call and its rationale). Do not duplicate it here.

## Highest-impact locked decisions (summary only — DECISIONS.md is the source)
- **RLS via `withTenant()`** is the only tenant data path. `no-raw-sql` ESLint enforces it.
- **Two-role split:** `app_runtime_login` (LOGIN, RLS forced) + `app_runtime` (NOLOGIN, grants).
- **Self-hosted Supabase on VPS** (2026-06-25) — reversed earlier "Phase 2 drops Supabase" plan.
  Backend = `supabase-db` + GoTrue auth + MinIO storage. Not Vercel/Upstash/Supabase-Cloud.
- **Auth:** `AUTH_PROVIDER=supabase` (GoTrue credential authority) + app opaque `hybrid_session`.
  `password` (own auth, Argon2id) remains a fallback.
- **Schema in `packages/db/sql/`** (00→05), not `supabase/migrations/`. 01/02 canonical, not edited.
- **Light mode only** Phase 0/1 (dark reads lower-trust for COD commerce in BD).
- **Storefront theme "Doreja"** — 2-col mobile grid, sticky bottom action bar, no carousels.

See [CLAUDE.md](../CLAUDE.md) "Roadmap context → Resolved infra decisions" for the dated list.
