-- 18_order_notify.sql — postgres LISTEN/NOTIFY trigger for real-time order
-- events. The web app subscribes via /api/orders/stream (SSE) to push new
-- orders + status changes to the owner dashboard without polling.
--
-- Payload is intentionally compact — large fields are excluded to keep the
-- NOTIFY queue message short. The client re-fetches full order details
-- via the standard REST endpoint when needed.

create or replace function fn_notify_order_event() returns trigger as $$
declare
  payload jsonb;
begin
  if (tg_op = 'DELETE') then
    return old;
  end if;

  payload := jsonb_build_object(
    'type', case when tg_op = 'INSERT' then 'insert' else 'update' end,
    'order_id', new.id,
    'tenant_id', new.tenant_id,
    'order_number', new.order_number,
    'fulfillment_status', new.fulfillment_status,
    'payment_status', new.payment_status,
    'grand_total', new.grand_total,
    'at', extract(epoch from now())::text
  );

  perform pg_notify('order_event', payload::text);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_order_event on orders;
create trigger trg_notify_order_event
  after insert or update on orders
  for each row execute function fn_notify_order_event();

-- pg_notify payload limit is ~8000 bytes by default — orders row exceeds that
-- when there are many line items. The compact payload above stays under 500
-- bytes for any single order.
