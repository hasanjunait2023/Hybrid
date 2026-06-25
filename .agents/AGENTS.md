# AGENTS — tools & operational rules

> Identity & limits: `.agents/SOUL.md`. Project context: `CLAUDE.md` (root), `.claude/CONTEXT.md`.

## Workflow per task
1. Read `.claude/CONTEXT.md` + the relevant `docs/` truth file.
2. Plan briefly (steps → verification per step).
3. Implement against real DB/services. Tenant data via `withTenant()`.
4. Verify (see `.claude/hooks/completion-gate.md`).
5. Self-review with `.claude/hooks/judge-prompt.md` before claiming done.

## Tooling
| Concern | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` (Next on :3000, `*.lvh.me` resolves to localhost) |
| DB + logic tests (gate) | `pnpm --filter @hybrid/db test` (63 tests, embedded-postgres, no Docker) |
| Typecheck | `pnpm typecheck` |
| Lint (incl. no-raw-sql) | `pnpm lint` |
| Regen DB types | `pnpm db:gen` (needs live `DIRECT_URL`) |
| Migrate / seed | `pnpm db:migrate` / `pnpm db:seed` |
| FastAPI jobs | `apps/api/` (courier sync, reconciliation) |

## Data access contract
- `withTenant(tenantId, userId, tx => ...)` — the ONLY tenant data path (`app_runtime_login`, RLS forced).
- `asPlatformAdmin(...)` / `DIRECT_URL` — migrations, seed, platform-admin, provisioning (`postgres`, BYPASSRLS).
- After any tenant mutation, `revalidateTag(...)` per the cache-tag scheme in `CLAUDE.md`.

## Boundaries (monorepo)
- Shared UI → `packages/ui` (not per-app component copies).
- Pure payment/courier logic → `packages/payments` / `packages/couriers` (no Next/DB).
- DB contract → `packages/db` (client.ts is INTERNAL; export only `withTenant`/`asPlatformAdmin`).
- Next app code → `apps/web`; heavy async jobs → `apps/api` (FastAPI).
- Auth-gated route segments → `export const dynamic = "force-dynamic"`.

## Definition of Done
The 5-point DoD in `.claude/hooks/completion-gate.md`. No exceptions.
