-- ============================================================================
-- 36_o16_cart_recovery.sql — O16 abandoned-cart SMS recovery
-- Additive, idempotent; runs after 35.
--
-- What this adds:
--   * cart.last_reminder_at — when we last sent a recovery SMS for this cart.
--     Prevents a misconfigured cron from spamming the same cart every hour.
--   * cart.recovery_attempts — count of recovery attempts (1, 2, 3). We cap
--     at 3 total per cart per the O16 spec ("3 nudges max before we give
--     up and let the cart die"). After the 3rd attempt with no recovery,
--     the abandoned cart sweep stops sending for that cart.
--   * tenant.sms_cart_recovery_enabled — kill switch per-tenant. When
--     false, the cron sweep skips that tenant entirely.
--   * tenant.sms_cart_recovery_hours — list of {delay hours, template key}
--     pairs the sweep uses. Stored on tenant so merchants can tune their
--     own cadence. Default: 1h, 24h, 72h with templates reminder_1h /
--     reminder_24h / reminder_72h.
-- ============================================================================

alter table cart
  add column if not exists last_reminder_at  timestamptz,
  add column if not exists recovery_attempts integer not null default 0;

alter table tenant
  add column if not exists sms_cart_recovery_enabled boolean not null default true,
  add column if not exists sms_cart_recovery_hours  integer[] not null default array[1, 24, 72]::integer[];

-- CHECK keeps the attempts count sensible.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cart_recovery_attempts_check'
  ) then
    alter table cart
      add constraint cart_recovery_attempts_check
      check (recovery_attempts >= 0 and recovery_attempts <= 10);
  end if;
end $$;

-- Partial index — sweep only walks carts that still have a chance.
-- (abandoned but not yet recovered, AND under the cap, AND not currently
-- waiting on a reminder whose grace period hasn't elapsed).
create index if not exists cart_recovery_pending_idx
  on cart (tenant_id, abandoned_at)
  where abandoned_at is not null
    and recovered_at is null
    and recovery_attempts < 3;

-- Down migration
-- (see packages/db/sql/down/36_o16_cart_recovery.down.sql)
