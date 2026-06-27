# S2.C4 — Production Deploy Verification (2026-06-27)

Boss approved "Proceed" → deploy the DBID wizard to production.
This is the post-deploy verification, all real.

## Steps taken

1. **Migration already live** (from the dry-run earlier in the session).
   Verified: `dbid_submission` table exists with RLS forced + 3 indexes + 19 cols.
2. **Pushed commits to GitHub** — VPS pull was lagging at `c261a5f`
   (Jun 26 shipping calculator commit). Pushed `20ade3e` so VPS can
   fast-forward to the wizard code.
3. **VPS ff-only pull** — pulled the 3 new commits cleanly. Zero conflicts.
4. **DBID files present on VPS**:
   - `/opt/hybrid/apps/web/app/(admin)/admin/settings/dbid/page.tsx`
   - `/opt/hybrid/apps/web/app/(admin)/admin/settings/dbid/DbidForm.tsx`
   - `/opt/hybrid/apps/web/app/(admin)/admin/settings/dbid/actions.ts`
   - `/opt/hybrid/apps/web/lib/admin/dbid.ts`
   - `/opt/hybrid/apps/web/lib/i18n/dictionaries/{en,bn}/admin/settingsDbid.ts`
   - `/opt/hybrid/packages/db/sql/22_dbid.sql` + `.down.sql`
5. **Web container rebuild** — `bash /opt/hybrid/deploy.sh`:
   - Build time: 1m 26s (clean — no type errors, no lint failures)
   - Container recreated + started in <1s
6. **Route registered** — Next.js build output contains:
   - `dbid/page.js` (server bundle)
   - `dbid/page.js.nft.json`
   - `dbid/page_client-reference-manifest.js`
   - `dbid/page-f95defbd271ec3fc.js` (client chunk)
7. **HTTP smoke test** (no auth — expect login redirect):
   - `GET https://admin.hybrid.ecomex.cloud/settings` → **HTTP 200**
     → redirects to `/login` (title "Log in — Hybrid"), expected.
   - `GET https://admin.hybrid.ecomex.cloud/settings/dbid` → **HTTP 200**
     → same login redirect, route exists & renders shell.

## What's now live for every Hybrid tenant

- **Settings hub** (Bengali + English) → "DBID Compliance" row
- **`/admin/settings/dbid`** route → 4-step wizard
- **Auto-save per step** (advances wizard on save)
- **Sealed AES-256-GCM** for NID, TIN, Trade License, BIN
- **Last-4 hint only** leaves the server (display indicator)
- **Status workflow**: not_started → in_progress → submitted → approved|rejected
- **Re-submission after rejection** auto-flips status back to editable
- **i18n bilingual**: mirrors gov.bd DBID portal vocabulary in Bangla

## Caveats (honest)

- **No tenants have used it yet** — wizard is fresh in production. First
  use will surface any UX bugs that didn't show in build/typecheck.
- **Platform admin reviewer UI** not built — DBID submissions flip to
  `submitted` and wait for a human. Reviewer surface is a separate task
  (bundled with S2.C5 per roadmap).
- **Marketing claim** ("only BD SaaS with built-in DBID compliance")
  can now be made — it's actually true and verifiable in production.

## First user verification path

To verify with a real tenant:

1. Log in as `owner-a` (or any test owner) on `admin.hybrid.ecomex.cloud`
2. Navigate to **Settings → DBID Compliance**
3. Complete the 4 steps, see status change
4. Log back in as platform admin → `app.hybrid.ecomex.cloud/platform/dbid`
   (this surface isn't built yet — pending S2.C5)