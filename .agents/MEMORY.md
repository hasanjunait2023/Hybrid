# MEMORY — project facts & past decisions

> This is a pointer. The living memory of this project lives in dedicated files — do not
> duplicate their content here (drift risk). Read those directly.

## Canonical memory sources
| What | Where |
|---|---|
| Full project context | `CLAUDE.md` (root) |
| Mission / why it exists | `.claude/team/MISSION.md` |
| Decisions log (why each call was made) | `.claude/team/DECISIONS.md` (46KB, authoritative) |
| Open work / backlog | `.claude/team/BACKLOG.md` |
| Current state snapshot | `.claude/team/STATE.json` |
| Shipped history | `CHANGELOG.md` |
| Known issues / tech debt | `CLAUDE.md` → "Known issues / tech debt" |

## Load-bearing facts (the things agents forget and break)
1. Backend is **self-hosted Supabase on the VPS** (not Vercel/Upstash/Supabase-Cloud).
   This reversed the earlier "Phase 2 drops Supabase" plan (2026-06-25).
2. Auth = **Supabase GoTrue** (`AUTH_PROVIDER=supabase`) + app opaque `hybrid_session`.
3. Storage = **Supabase MinIO** (`BLOB_DRIVER=s3`), CDN `cdn.hybrid.ecomex.cloud`.
4. Schema lives in `packages/db/sql/` (00→05), **not** a `supabase/migrations/` dir.
   `01_schema.sql` / `02_policies.sql` are canonical — do not edit directly.
5. RLS via `withTenant()` is the only tenant data path. Unchanged through all infra moves.
6. Status: Phase 1 + Phase 2 (M3) complete, live.
