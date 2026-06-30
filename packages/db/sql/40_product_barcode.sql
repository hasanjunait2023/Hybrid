-- Migration 40 — Product-level barcode + unique-per-tenant index on variant barcode.
--
-- Why now: O19 (barcode labels). Variants already had `barcode text` from the
-- original schema, but:
--   1. No UNIQUE index — admins could type the same barcode on two variants
--      and not know it (printing duplicate labels is annoying but not data-loss).
--   2. The product table has no `barcode` column, so a product without
--      variants (or with all variants sharing a parent barcode) had no
--      canonical barcode.
--
-- Pattern: a barcode is OPTIONAL on both levels. The unique index is partial
-- (`where barcode is not null`) so rows without a barcode don't collide. The
-- index is per-tenant (compound) so two tenants can both sell "1234567890".
--
-- The label-printing UI falls back gracefully:
--   • If product.barcode is set → use that as the top-level code
--   • Else if first variant has a barcode → use that
--   • Else render a placeholder "NO BARCODE" tile so the admin notices

begin;

alter table product
  add column if not exists barcode text;

create unique index if not exists product_variant_barcode_uniq
  on product_variant(tenant_id, barcode)
  where barcode is not null;

create unique index if not exists product_barcode_uniq
  on product(tenant_id, barcode)
  where barcode is not null;

commit;
