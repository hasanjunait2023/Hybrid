-- Migration 52 — Tracking V2 Phase B (TRACK-V2-B1)
--
-- Funnel + enhanced match + UTM capture. Pure additive — every column is
-- nullable and every migration number > 50 in this file is independent of
-- 51_tracking_v2_phase_a.sql (sibling migration: TikTok log columns). The
-- orders/customer changes here are the Phase B half: order UTM attribution
-- (source/medium/campaign/content/term) and a sticky "first_utm_source" on
-- the customer row so the marketing team can answer "where did our buyers
-- come from?" without joining the abandoned_cart / tracking_event_log
-- tables.
--
-- Why these columns (and not a separate attribution table):
--   * Order UTM is a flat 5-tuple: source/medium/campaign/content/term.
--     A wide row is cheaper to read than a join for the merchant's ad
--     dashboard, and Phase A's tracking_event_log is the deep audit store.
--   * customer.first_utm_source is the first-touch snapshot (set on the
--     customer's first order only). Repeated purchases with a different
--     UTM do NOT overwrite it — that's what the orders.utm_source column
--     is for (last-touch per order).
--
-- Privacy: UTMs are NOT personally identifying on their own. They are
-- attached to orders/customer rows in the same way the existing order
-- shipping_address jsonb is — RLS via withTenant() is the only access
-- path. No PII is added.

alter table orders
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text;

-- Partial index — the marketing team queries "orders for utm_source=newsletter"
-- for the per-source revenue dashboard. Partial index keeps it small
-- (most orders have no UTM yet during early rollout).
create index if not exists orders_utm_source_idx
  on orders(tenant_id, utm_source)
  where utm_source is not null;

-- First-touch UTM (set on the customer's first attributed order; never
-- overwritten by later orders). Lets the platform surface "where did this
-- customer first find us?" without joining orders.
alter table customer
  add column if not exists first_utm_source text;

-- tracking_event_log already has event_source per Phase A. Phase B also
-- benefits from a `match_score` column for Meta CAPI Enhanced Match
-- quality (we don't compute it on the server — we just persist what
-- Meta returns in the response). test_event_code + external_id are
-- already present from migration 51; the ones below are extra with the
-- same shape (`if not exists` so running 52 after 51 is a no-op).

-- The match_score column was added in 51. The order UTM and customer
-- first_utm_source are the new bits.

-- Note: orders + customer UTM columns are documented in the
-- apps/web/lib/analytics/utm.ts comment and consumed by placeOrder.ts.
-- The first_utm_source write is inside the customer's first order txn
-- (idempotent: only set when the existing value IS NULL).
