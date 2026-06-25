# COMPLETION GATE

"Done" means **verified**, not "written".

## A task is complete only when
1. Implemented against real DB/services (no stub/mock in shipping code).
2. Tenant-safe — all tenant data via `withTenant()`, RLS respected.
3. Verified — the task's stated verification passes:
   - DB / logic changes → `pnpm --filter @hybrid/db test` (63 tests green)
   - Type safety → `pnpm typecheck` clean
   - Lint (incl. `no-raw-sql`) → `pnpm lint` clean
   - UI changes → run it; describe what was observed (mobile-first + Bengali)
4. Errors handled — no silent failures; user-facing errors friendly + Bengali.
5. Reviewed — no TODOs, no unguarded tenant access, no plaintext secrets.

## Per-task Definition of Done (from docs/BUILD_CHECKLIST.md)
- [ ] Real DB/services (no stub/mock)
- [ ] Tenant-safe (withTenant, RLS)
- [ ] Tested/verified (verification passes)
- [ ] Errors handled (friendly + Bengali)
- [ ] Reviewed (no TODOs/unguarded access/plaintext secrets)

## Reporting
State what was verified and how. Show test output. If something was skipped or
failed, say so plainly. Do not claim done on unverified work.
