-- ============================================================================
-- 32_o13_tin_bin.sql — TIN / BIN on invoice (Bangladesh tax compliance)
--
-- Adds dedicated, validated columns to `tenant` for the two NBR (National
-- Board of Revenue) identifiers every Bangladesh business invoice must carry:
--
--   * TIN — Taxpayer Identification Number. 12 numeric digits per NBR spec.
--           Used by both individuals and organizations. Required on any
--           invoice whose value exceeds ৳200,000 and on most B2B/corporate
--           invoices by convention.
--
--   * BIN — Business Identification Number. 10 numeric digits per NBR spec.
--           Issued only to registered businesses (trade license required).
--           Optional for unregistered micro-merchants; required once the
--           merchant has a trade license.
--
-- Validation happens in two layers:
--   1. CHECK constraints here enforce digit-only + exact length at the DB
--      boundary. Anything else (free text, dashes, spaces) is rejected
--      outright. This is the safety net the application can rely on.
--   2. The Zod schema in apps/web/lib/settings/tenantTax.ts mirrors this and
--      gives the UI a friendly Bengali error message before the round-trip.
--
-- Both columns are nullable: a brand-new tenant (the default trial state)
-- doesn't have them yet and that's fine — they render nothing on the invoice
-- until the owner fills them in via Settings → Tax / Business.
--
-- The existing free-form `tenant.settings.vatBin` text stays untouched —
-- that's a legacy catch-all label merchants still type into ("VAT-1234"
-- etc.). TIN and BIN are the new, validated, formally-rendered pair.
--
-- Idempotent. Runs after 31.
-- ============================================================================

-- ---- columns ---------------------------------------------------------------
-- text (not citext): NBR IDs are pure digits, case is irrelevant.
-- no length cap: the constraint below enforces 12 / 10 exactly; over-long or
-- under-long input fails the CHECK rather than silently truncating.
alter table tenant
  add column if not exists tin text,
  add column if not exists bin text;

-- ---- validation ------------------------------------------------------------
-- digit-only is enforced by the regex. We allow NULL (not yet filled) but
-- once filled, the value MUST match the NBR format. The constraint name is
-- stable so an operator can drop it manually if they ever need to bulk-fix
-- legacy bad data.
alter table tenant
  drop constraint if exists tenant_tin_format,
  drop constraint if exists tenant_bin_format;

alter table tenant
  add constraint tenant_tin_format
    check (tin is null or tin ~ '^[0-9]{12}$'),
  add constraint tenant_bin_format
    check (bin is null or bin ~ '^[0-9]{10}$');

-- ---- index -----------------------------------------------------------------
-- A composite (tenant_id) UNIQUE is meaningless (tenant_id is already the
-- primary key path) so a plain partial index is enough — used when an admin
-- ever wants to list "all tenants missing TIN/BIN" for compliance audit.
-- Created UNUSED in normal traffic; harmless if never queried.
create index if not exists tenant_tin_present_idx
  on tenant (id)
  where tin is not null;

create index if not exists tenant_bin_present_idx
  on tenant (id)
  where bin is not null;