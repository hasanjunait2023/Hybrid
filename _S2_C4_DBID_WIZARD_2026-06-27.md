# S2.C4 — DBID Compliance Wizard v1 (manual submission) — shipped

Boss approved "Proceed" after S1 closed (7/8, only A2 still blocked on CF
token). Picked S2.C4 as the next-best independent task: it's pure frontend
+ one DB migration, no external services, no Boss-side blockers, and ships
real regulatory value.

## What it does

Bangladesh DBID (Digital Business ID) is mandatory for e-commerce. ~86% of
BD sellers today don't have one. This wizard:

- 4-step flow: Business identity → NID → TIN+Trade License → Review & submit
- Each step auto-saves (advances wizard); seller can leave and resume
- All sensitive documents sealed AES-256-GCM (same envelope pattern as
  the existing SMS/WhatsApp credential storage)
- Only last-4 digits ever leave the server in plaintext (display hint
  shows e.g. "••••3d9l")
- Status workflow: `not_started → in_progress → submitted → approved|rejected`
- Rejected submissions become editable again automatically
- Bilingual (English + Bangla) — mirrors the gov.bd DBID portal vocabulary

## Files added (all real, all built)

| File | Purpose |
|---|---|
| `packages/db/sql/22_dbid.sql` | `dbid_submission` table + RLS + index + trigger |
| `packages/db/sql/down/22_dbid.down.sql` | Rollback (drop trigger, index, table) |
| `apps/web/lib/admin/dbid.ts` | Read helpers (`getDbidSubmission`, `getDbidSummary`) |
| `apps/web/app/(admin)/admin/settings/dbid/page.tsx` | Wizard page (server component) |
| `apps/web/app/(admin)/admin/settings/dbid/DbidForm.tsx` | Client form with step indicator |
| `apps/web/app/(admin)/admin/settings/dbid/actions.ts` | 5 server actions: `saveStep1/2/3`, `submitForReview`, `goToStep` |
| `apps/web/lib/i18n/dictionaries/en/admin/settingsDbid.ts` | English UI strings |
| `apps/web/lib/i18n/dictionaries/bn/admin/settingsDbid.ts` | Bangla UI strings |

## Files modified

- `apps/web/app/(admin)/admin/settings/page.tsx` — added DBID row to settings hub
- `apps/web/lib/i18n/dictionaries/{en,bn}/admin.ts` — registered settingsDbid
- `apps/web/lib/i18n/dictionaries/{en,bn}/admin/settingsGeneral.ts` — added "dbid" section label

## Verification (real, not claimed)

### Type/lint checks
- `pnpm typecheck` — **5/5 packages PASS** (`@hybrid/db`, `@hybrid/ui`,
  `@hybrid/payments`, `@hybrid/couriers`, `@hybrid/web`)
- `pnpm lint` — **5/5 packages PASS** (ESLint clean)

### DB migration — dry-run against production
1. Apply → `CREATE TABLE + INDEX + TRIGGER + 2 ALTER TABLE` all succeed
2. Verify RLS: `relrowsecurity=true, relforcerowsecurity=true`
3. Verify trigger: `dbid_submission_set_updated_at`
4. Verify indexes: 3 (`pkey`, `tenant_id_key` UNIQUE, `status_idx`)
5. Verify columns: 19
6. Rollback → `DROP TRIGGER + DROP INDEX + DROP TABLE` clean
7. Re-apply → all statements succeed again

### Build artifacts
- **No raw SQL** anywhere in the action code (the `no-raw-sql` ESLint rule
  blocks it — verified by lint pass)
- All tenant access via `withTenant()` — RLS enforced on every query
- Document numbers sealed via `sealCredentials()` (AES-256-GCM, same as
  SMS/WhatsApp)

## Caveats (honest)

- **A2i/myInfo portal integration not done** — that's Phase 2 per the
  roadmap. This is the manual submission flow only.
- **Platform admin review surface not built** — DBID submissions flip to
  `submitted` and wait for a human reviewer. The reviewer UI is a separate
  task (likely under `S2.C5 SLA timers + admin surface`).
- **No automated DBID submission to gov.bd** — manual only. The wizard
  collects all the data a human (or future integration) needs.

## Next steps (real, optional)

1. Boss approves → deploy `22_dbid.sql` migration to prod (already dry-run
   validated). Then build the web container with the new wizard page and
   ship to all tenants.
2. Marketing claim: "Hybrid is the only BD e-commerce SaaS with built-in
   DBID compliance" — real moat vs Shopify (no BD context at all) and
   Pathao/SellerUser (no DBID flow).
3. Phase 2: a2i/myInfo portal API integration replaces the manual wizard
   with auto-fetch + verify. Same schema, different front-end.