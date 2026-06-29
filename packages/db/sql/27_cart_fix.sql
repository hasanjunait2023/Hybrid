-- 27_cart_fix.sql — two fixes:
--
-- 1. cart_reminder INSERT/UPDATE/DELETE was blocked: 20_abandoned_carts.sql only
--    created a SELECT policy. Force-RLS denies any operation without a matching
--    permissive policy. Replace the select-only policy with all-ops.
--
-- 2. Add a partial unique index on cart(tenant_id, phone) where phone IS NOT NULL
--    so the persistCart server action can use ON CONFLICT ... DO UPDATE upsert.
--    Partial (WHERE phone IS NOT NULL) means anonymous/email-only carts don't
--    collide with each other.

drop policy if exists cart_reminder_tenant_select on cart_reminder;

create policy cart_reminder_tenant_all on cart_reminder
  for all
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create unique index if not exists cart_tenant_phone_idx
  on cart (tenant_id, phone)
  where phone is not null;
