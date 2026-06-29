-- 28_shipment_notify.sql — Postgres LISTEN/NOTIFY trigger for real-time
-- shipment status changes. The web app subscribes via /api/shipments/stream
-- (SSE) to push delivery updates to the owner dashboard without polling.
--
-- Mirrors the pattern in 18_order_notify.sql. Payload is intentionally
-- compact to stay well under the 8 KB pg_notify limit.

create or replace function fn_notify_shipment_event() returns trigger as $$
declare
  payload jsonb;
begin
  if (tg_op = 'DELETE') then
    return old;
  end if;

  -- Only emit when status changes (avoid noise on unrelated column updates).
  if (tg_op = 'UPDATE' and new.status = old.status) then
    return new;
  end if;

  payload := jsonb_build_object(
    'type',             case when tg_op = 'INSERT' then 'insert' else 'update' end,
    'shipment_id',      new.id,
    'tenant_id',        new.tenant_id,
    'order_id',         new.order_id,
    'status',           new.status,
    'tracking_number',  new.tracking_number,
    'at',               extract(epoch from now())::text
  );

  perform pg_notify('shipment_event', payload::text);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_shipment_event on shipment;
create trigger trg_notify_shipment_event
  after insert or update on shipment
  for each row execute function fn_notify_shipment_event();
