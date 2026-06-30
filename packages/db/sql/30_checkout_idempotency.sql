-- Storefront checkout idempotency key.
-- A UUID minted client-side before form submit and sent with every attempt.
-- placeOrder pre-checks this key and returns the existing order on a re-submit,
-- preventing duplicate orders from network jitter or retried form submissions.
--
-- Partial unique index (NOT NULL only) so orders without a key (admin manual,
-- API, legacy) are completely unaffected — the constraint never fires for them.

alter table orders add column if not exists idempotency_key uuid;

create unique index if not exists orders_idempotency_key_idx
  on orders (tenant_id, idempotency_key)
  where idempotency_key is not null;
