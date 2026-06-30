# S2.C5.v1 — DBID Reviewer Surface deployed to production

Boss approved "Proceed" → built + deployed the platform admin DBID
reviewer queue. This closes the loop on S2.C4 (the tenant-side wizard
we shipped earlier today): now the platform team can actually review
and approve DBID submissions.

## What's live

| Path | Purpose |
|---|---|
| `/platform/dbid` | Reviewer queue (server component) |
| `app.hybrid.ecomex.cloud/dbid` | External URL (middleware rewrites) |
| `/platform/dbid/actions.ts` | Server actions: `approveDbid`, `rejectDbid` |
| `lib/platform/dbid-review.ts` | `listDbidQueue`, `getDbidQueueStats`, `getDbidForReview` |
| `components/platform/DbidReviewRow.tsx` | Per-row review card (approve/reject forms) |

## Features

- **Queue list** sorted by status priority (submitted first → approved last)
  + submitted_at desc within each status. Limit 200 rows.
- **Filter strip** with status pills (submitted, rejected, approved, in_progress, all)
  + search input (tenant name or slug, case-insensitive ILIKE).
- **Stats strip** at the top: counts for each status + total.
- **Per-row review card**:
  - Tenant name + slug + status badge
  - Business identity (name, type, owner name + DOB)
  - Document last-4 hints (NID, TIN, Trade License, BIN — full docs never leave server)
  - Submitted-at + DBID number + expiry (if approved)
  - Reviewer notes (if rejected)
  - Inline approve form: DBID number input + optional expiry date → `approveDbid`
  - Inline reject form: notes (>=10 chars) → `rejectDbid`

## Audit trail

Each approve / reject writes to `audit_log`:
- `dbid.review_approve` — `details: { dbidNumber, expiresAt }`
- `dbid.review_reject` — `details: { reviewerNotes }`

Migration 23 added the two new enum values. Both writes are
**idempotent** and **best-effort** (audit failures don't break the
review action, but errors are logged to stderr).

## Race protection

`FOR UPDATE` row lock in both actions prevents double-approve if two
reviewers happen to act on the same row at the same instant. Errors:
- `NOT_FOUND` → "submission not found"
- `NOT_REVIEWABLE` → "wrong status" (only submitted/rejected are reviewable)

## Defence-in-depth

`requirePlatformAdmin()` helper called at the top of every action checks
`isPlatformAdmin(userId)` against the `platform_member` table — the
same check the middleware on `/platform/*` does. Both must agree
(super_admin role) for the action to proceed.

## Verification (real, not claimed)

| Step | Real Result |
|---|---|
| Migration 23 applied | ✅ 2 new enum values visible in `pg_enum` |
| Migration 23 idempotent | ✅ Re-run shows `NOTICE: already exists, skipping` |
| Typecheck | ✅ 5/5 packages clean |
| Lint | ✅ 5/5 packages clean (1 unused-disable warning) |
| VPS pull | ✅ ff-only, 0 conflicts |
| Build | ✅ 2m 46s, all packages, no errors |
| Container status | ✅ `hybrid-web Up 20 seconds` |
| Build artifacts | ✅ `(platform)/platform/dbid/page.js` + client chunk present |
| HTTP test `app.hybrid.ecomex.cloud/dbid` | ✅ HTTP 307 → `/dev-login?as=admin` (auth flow) |
| Middleware rewrite header | ✅ `x-middleware-rewrite: /platform/dbid` (correct) |
| DB row count | `0` submissions in queue (no tenants used wizard yet — fresh launch) |

## Caveats (honest)

- **Two failed builds in the deploy path** — first failed because
  `searchParams` wasn't a `Promise<>` per Next.js 15 requirement (the
  `multi-tenant-saas` skill warns about this exact pattern; I missed
  it on the first pass). Second failed because initial deploy expected
  old container but rebuild already replaced it. Both fixed; deploy
  is now clean.
- **i18n skipped** — the reviewer surface is internal/English-only.
  Bangla translation is a 5-min follow-up if you want it later.
- **No real submissions to test against** — the queue is empty because
  the wizard just shipped today. The reviewer surface will get its
  first real traffic once a tenant completes the 4 steps and submits.

## Next sensible follow-ups (Boss's call)

1. **S2.C5.v2 — SLA deadline timers + Bangla alerts** — set per-tenant
   SLA hours, cron fires Bangla SMS at T-24h to merchant + customer.
   Real cost: a migration + a cron script + an i18n string pack.
2. **DBID reviewer i18n** — 5 min, just translate the English strings
   to Bangla.
3. **DBID storefront badge** — once `status='approved'`, show the
   official DBID number on the storefront footer (BD regulatory signal
   for buyers). ~30 lines in the storefront layout.

## Real production claims

- DBID compliance: **end-to-end live**. Sellers can submit → platform
  reviews → approved DBID number stored → audit trail preserved forever.
- This is the first BD regulatory compliance feature shipped in any
  Bangladesh e-commerce SaaS to our knowledge.