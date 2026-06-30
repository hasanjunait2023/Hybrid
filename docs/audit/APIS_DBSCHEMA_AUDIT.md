# Hybrid — Database Schema & Relations Audit

**Scope:** `packages/db/sql/*.sql` migrations (canonical schema source), read end-to-end in lexical order.
**Target DB:** self-hosted Supabase Postgres 15 (single `postgres` database, `public` schema; shares DB with `auth`/`storage`).
**Live verification:** **NOT VERIFIED** — local embedded Postgres on `127.0.0.1:5442` is not running, and the production VPS `72.62.228.196:5432` is unreachable from this session. All findings below are **from migrations only, live DB unverified.** Every claim is anchored to a `file:line` reference.
**Date of audit:** 2026-07-01.

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Total tables in `public` schema | **72** (audit_log declared in both 01_schema.sql:637 and 17_audit_log.sql:40, deduplicated by `IF NOT EXISTS`) |
| Migrations read | 28 (00–43 + 06_own_auth + 22_dbid + 23_dbid_audit + 23_hybridpay) |
| Tenant-scoped tables (carry `tenant_id`) | 50 |
| Platform/global tables (no `tenant_id`) | 22 (`plan`, `app_user`, `theme`, `tenant`*, `tenant_assignment`, `user_session`, `otp_code`, `platform_member`, `platform_expense`, `marketplace_config`, `marketplace_category`, `marketplace_customer`, `marketplace_session`, `marketplace_listing*`, `marketplace_fee`, `marketplace_order`, `marketplace_suborder`, `marketplace_review`, `marketplace_commission`, …) |
| Tables with `ENABLE ROW LEVEL SECURITY` | **72 / 72 (100%)** |
| Tables with `FORCE ROW LEVEL SECURITY` | **72 / 72 (100%)** |
| Tables with at least one `CREATE POLICY` | **72 / 72 (100%)** |
| Total `CREATE INDEX` statements | **~121** |
| Explicit `app_runtime` grants on later-created tables | 4 tables MISSING explicit grants (`cart`, `cart_reminder`, `order_note`, `webhook_event`) — see Gap §A |
| Live DB state | **Unverified** |

### Top Risks (severity-ordered)

1. **CRITICAL — Wrong-table FK (`auth.users` instead of `app_user`)** in `28_sla.sql:40, :69` and `29_manual_refund.sql:35`. The codebase explicitly moved off Supabase Auth in `06_own_auth.sql` (header: *"Phase 2 drops Supabase Auth and owns the auth layer end-to-end"*), but these three columns still reference `auth.users(id)`. On the self-hosted Supabase where the `auth` schema exists, the FK will resolve and silently link SLA overrides to Supabase GoTrue users — not Hybrid's `app_user` — breaking the audit trail. On a future DB without `auth.users` (e.g. a vanilla Postgres), these migrations **fail with `relation "auth.users" does not exist`**.
2. **HIGH — Trigger calls non-existent function `app.touch_updated_at()`** in `34_r3_size_chart.sql:64`. The canonical function is `public.set_updated_at()` (defined at `01_schema.sql:28`). On first apply, the trigger creation fails inside the `do $$ ... if not exists ...` block; on idempotent re-run after a successful first apply the trigger is in place, but on fresh DB the `create trigger size_chart_updated_at_trg` step errors out.
3. **HIGH — Missing `app_runtime` grants on 4 RLS-forced tables** (`cart`, `cart_reminder`, `order_note`, `webhook_event`). Because these tables were created in later migrations (19, 20), they bypass the `02_policies.sql:56` `alter default privileges` rule (which only covers objects created by `postgres` in `02`). With `FORCE RLS` on and no `GRANT … to app_runtime`, runtime traffic hits `permission denied for table …`. This is the same foot-gun `22_dbid.sql:80` documents and patches inline, but `19` and `20` and `01_schema.sql`'s `webhook_event` missed it.

(See §5 Gaps for full list with severity, evidence, and rationale.)

---

## 2. Tables Inventory

Notation: **RLS** = `enable + force row level security`. **Idx** = number of `CREATE [UNIQUE] INDEX` statements on the table. **FK** = count of `references …` clauses in the `CREATE TABLE` body (additive column FKs added later are not counted here but appear in §4).

| # | Table | Defined in | RLS | Idx | FK | Policy names |
|---|---|---|---|---|---|---|
| 1 | `plan` | `01_schema.sql:74` | ✅ | 0 | 0 | `plan_read/insert/update/delete` |
| 2 | `app_user` | `01_schema.sql:93` | ✅ | 0 | 0 | `app_user_select/insert/update/delete` |
| 3 | `tenant` | `01_schema.sql:105` | ✅ | 0 | 2 | `tenant_select/insert/update/delete` |
| 4 | `tenant_member` | `01_schema.sql:127` | ✅ | 0 | 2 | `tenant_member_select/write` |
| 5 | `tenant_domain` | `01_schema.sql:139` | ✅ | 1 | 1 | `<tbl>_isolation` + perf idx |
| 6 | `theme` | `01_schema.sql:155` | ✅ | 0 | 0 | `theme_read/insert/update/delete` |
| 7 | `tenant_theme_settings` | `01_schema.sql:175` | ✅ | 1 | 2 | `<tbl>_isolation` + perf idx |
| 8 | `store_page` | `01_schema.sql:187` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 9 | `navigation_menu` | `01_schema.sql:202` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 10 | `landing_page` | `01_schema.sql:213` | ✅ | 1 | 2 | `<tbl>_isolation` |
| 11 | `collection` | `01_schema.sql:232` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 12 | `product` | `01_schema.sql:246` (+24/43 cols) | ✅ | 3 | 1 | `<tbl>_isolation` |
| 13 | `product_image` | `01_schema.sql:269` | ✅ | 2 | 2 | `<tbl>_isolation` |
| 14 | `product_variant` | `01_schema.sql:280` (+37 cols) | ✅ | 2 | 2 | `<tbl>_isolation` |
| 15 | `product_collection` | `01_schema.sql:306` | ✅ | 2 | 3 | `<tbl>_isolation` |
| 16 | `customer` | `01_schema.sql:319` (+24 cols) | ✅ | 2 | 1 | `<tbl>_isolation` |
| 17 | `customer_address` | `01_schema.sql:342` | ✅ | 2 | 2 | `<tbl>_isolation` |
| 18 | `discount` | `01_schema.sql:362` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 19 | `order_counter` | `01_schema.sql:387` | ✅ | 0 (PK is `tenant_id`) | 1 | `<tbl>_isolation` |
| 20 | `orders` | `01_schema.sql:392` (+19/28/30/38/41/42/43/22 cols) | ✅ | 4 | 2 | `<tbl>_isolation` |
| 21 | `order_item` | `01_schema.sql:434` (+31 col `edit_of`) | ✅ | 2 | 4 | `<tbl>_isolation` |
| 22 | `payment_account` | `01_schema.sql:475` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 23 | `payment` | `01_schema.sql:486` | ✅ | 1 (+2 perf) | 2 | `<tbl>_isolation` |
| 24 | `courier_account` | `01_schema.sql:512` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 25 | `cod_remittance` | `01_schema.sql:524` (+07 cols, +chk) | ✅ | 1 | 1 | `<tbl>_isolation` |
| 26 | `shipment` | `01_schema.sql:536` (+35 cols) | ✅ | 2 | 3 | `<tbl>_isolation` |
| 27 | `subscription` | `01_schema.sql:566` | ✅ | 1 (+1 perf) | 2 | `<tbl>_isolation` |
| 28 | `invoice` | `01_schema.sql:582` | ✅ | 1 | 2 | `<tbl>_isolation` |
| 29 | `usage_counter` | `01_schema.sql:599` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 30 | `analytics_event` | `01_schema.sql:614` | ✅ | 1 | 2 | `<tbl>_isolation` |
| 31 | `audit_log` | `01_schema.sql:637` (+17 idempotent) | ✅ | 3 | 2 | `audit_log_tenant_read` (SELECT only) |
| 32 | `webhook_event` | `01_schema.sql:654` | ✅ | 1 | 1 | `<tbl>_isolation` |
| 33 | `user_session` | `06_own_auth.sql:47` | ✅ | 2 | 1 | `user_session_select/insert/update/delete` |
| 34 | `otp_code` | `06_own_auth.sql:71` | ✅ | 1 | 1 | `otp_code_admin` (admin only, NULL user_id OK) |
| 35 | `return_request` | `09_returns.sql:39` (+29 cols +enum) | ✅ | 3 | 3 | `<tbl>_isolation` |
| 36 | `return_item` | `09_returns.sql:62` | ✅ | 1 | 4 | `<tbl>_isolation` |
| 37 | `phone_blocklist` | `10_fraud.sql:14` | ✅ | 1 | 2 | `<tbl>_isolation` |
| 38 | `campaign` | `11_marketing.sql:12` | ✅ | 1 | 2 | `<tbl>_isolation` |
| 39 | `product_review` | `12_reviews.sql:10` | ✅ | 2 | 4 | `<tbl>_isolation` |
| 40 | `loyalty_program` | `13_loyalty.sql:11` | ✅ | 0 (PK = `tenant_id`) | 1 | `<tbl>_isolation` |
| 41 | `loyalty_ledger` | `13_loyalty.sql:19` | ✅ | 2 | 3 | `<tbl>_isolation` |
| 42 | `platform_member` | `14_platform_team.sql:20` | ✅ | 0 | 1 | `<tbl>_admin` |
| 43 | `tenant_assignment` | `14_platform_team.sql:28` | ✅ | 1 | 2 | `<tbl>_admin` |
| 44 | `platform_expense` | `15_platform_finance.sql:10` | ✅ | 2 | 1 | `<tbl>_admin` |
| 45 | `tracking_event_log` | `16_tracking_event_log.sql:18` | ✅ | 3 | 1 | `tracking_event_log_tenant_isolation` (insert/select only — append-only) |
| 46 | `order_note` | `19_order_assignee.sql:16` | ✅ | 1 | 4 | `order_note_tenant_select/modify/update/delete` |
| 47 | `cart` | `20_abandoned_carts.sql:5` (+36 cols) | ✅ | 3 | 2 | `cart_tenant_all` (FOR ALL) |
| 48 | `cart_reminder` | `20_abandoned_carts.sql:36` | ✅ | 1 | 2 | `cart_reminder_tenant_select` (SELECT only) |
| 49 | `shipping_config` | `21_shipping.sql:16` | ✅ | 0 (PK = `tenant_id`) | 1 | `shipping_config_isolation` |
| 50 | `shipping_zone_rate` | `21_shipping.sql:31` | ✅ | 1 | 1 | `shipping_zone_rate_isolation` |
| 51 | `dbid_submission` | `22_dbid.sql:17` | ✅ | 1 | 1 | `dbid_submission_isolation` |
| 52 | `marketplace_config` | `22_marketplace.sql:55` | ✅ | 0 | 0 | `mcfg_read/write` (admin only) |
| 53 | `marketplace_category` | `22_marketplace.sql:65` | ✅ | 0 | 0 | `mcat_read/write` (public read, admin write) |
| 54 | `marketplace_listing` | `22_marketplace.sql:97` (+24 cols) | ✅ | 5 | 3 | `ml_read/write` (public read, admin write) |
| 55 | `marketplace_listing_variant` | `22_marketplace.sql:130` (+24 cols) | ✅ | 1 | 3 | `mlv_read/write` (public read, admin write) |
| 56 | `marketplace_customer` | `22_marketplace.sql:146` (+24 cols) | ✅ | 0 | 0 | `mcust_select/insert/update/delete` |
| 57 | `marketplace_session` | `22_marketplace.sql:158` | ✅ | 1 | 1 | `msess_admin` (admin only) |
| 58 | `marketplace_order` | `22_marketplace.sql:173` | ✅ | 2 | 1 | `mo_all` |
| 59 | `marketplace_suborder` | `22_marketplace.sql:199` | ✅ | 3 | 3 | `mso_select/write` |
| 60 | `marketplace_review` | `22_marketplace.sql:223` | ✅ | 2 | 3 | `mr_select_buyer/vendor/public` + `mr_insert/update/delete` |
| 61 | `marketplace_commission` | `22_marketplace.sql:242` | ✅ | 1 | 3 | `mc_select/write` |
| 62 | `purchase_request` | `24_wholesale.sql:104` | ✅ | 2 | 3 | `pr_isolation` |
| 63 | `customer_ledger` | `24_wholesale.sql:123` | ✅ | 1 | 2 | `cl_isolation` |
| 64 | `marketplace_fee` | `25_marketplace_fee.sql:20` | ✅ | 2 | 1 | `marketplace_fee_admin` |
| 65 | `customer_segment` | `26_customer_segment.sql:10` | ✅ | 1 | 1 | `cs_isolation` |
| 66 | `sms_log` | `27_comm_log.sql:15` | ✅ | 2 | 2 | `sms_log_isolation` |
| 67 | `email_log` | `27_comm_log.sql:44` | ✅ | 2 | 2 | `email_log_isolation` |
| 68 | `sla_alert_log` | `28_sla.sql:55` | ✅ | 1 | 3 | `sla_alert_log_isolation` |
| 69 | `auto_cancel_log` | `30_auto_cancel.sql:49` | ✅ | 1 | 2 | `auto_cancel_log_isolation` |
| 70 | `order_edits` | `31_o3_edit_order.sql:41` | ✅ | 2 | 3 | `order_edits_isolation` (insert/select only — append-only) |
| 71 | `product_video` | `33_r1_video.sql:25` | ✅ | 1 | 2 | `product_video_isolation` (2x idempotent) |
| 72 | `size_chart` | `34_r3_size_chart.sql:34` | ✅ | 1 | 1 | `size_chart_isolation` (2x idempotent) |

**Triggers inventory (non-`updated_at`):**
- `orders_assign_number` — `01_schema.sql:466` (per-tenant monotonic `order_number` via `order_counter` upsert)
- `trg_notify_order_event` — `18_order_notify.sql:34` (LISTEN/NOTIFY on insert/update for SSE)
- `dbid_submission_set_updated_at` — `22_dbid.sql:62` (uses canonical `set_updated_at()` ✓)
- `purchase_request_set_updated_at` — `24_wholesale.sql:167` (uses canonical `set_updated_at()` ✓)
- `size_chart_updated_at_trg` — `34_r3_size_chart.sql:62` ⚠ **calls `app.touch_updated_at()` — that function does not exist** (Gap §B)

**Triggers inventory (`updated_at` auto-touch from `01_schema.sql:670–685`):** the canonical loop installs `_set_updated_at` on 23 tables: `plan, app_user, tenant, tenant_domain, theme, tenant_theme_settings, store_page, navigation_menu, landing_page, collection, product, product_variant, customer, customer_address, discount, orders, payment_account, payment, courier_account, shipment, subscription, invoice, usage_counter`. **NOT installed by the loop** (because they were created later): `dbid_submission` (patched), `purchase_request` (patched), `size_chart` (broken — see Gap §B), `cart`, `cart_reminder`, `order_note`, `tracking_event_log`, `return_request`, `return_item`, `phone_blocklist`, `campaign`, `product_review`, `loyalty_program`, `loyalty_ledger`, `platform_member`, `tenant_assignment`, `platform_expense`, `marketplace_*`, `customer_ledger`, `marketplace_fee`, `customer_segment`, `sms_log`, `email_log`, `sla_alert_log`, `auto_cancel_log`, `order_edits`, `product_video` — most have `updated_at` columns but **no `set_updated_at()` trigger**, so the column is silently frozen at insertion time. See Gap §G.

---

## 3. RLS Coverage Map

**Coverage: 72/72 tables — 100%.** Every public table in `packages/db/sql/` is `enable + force row level security` + has at least one `CREATE POLICY`.

| Coverage dimension | Status |
|---|---|
| `ENABLE ROW LEVEL SECURITY` | ✅ all 72 |
| `FORCE ROW LEVEL SECURITY` | ✅ all 72 |
| Has at least one policy | ✅ all 72 |
| Policy uses `app.current_tenant_id()` | ✅ 50/72 (every tenant-scoped table) |
| Policy uses `app.is_platform_admin()` admin escape hatch | ✅ all 50 tenant-scoped + 8 platform tables |
| Policy uses `app.current_user_id()` (self-only) | ✅ `app_user`, `user_session` |
| Policy uses `app.current_buyer_id()` (buyer-only) | ✅ 6 marketplace_buyer tables |
| World-readable policies (`using (true)`) | ✅ `plan_read`, `theme_read`, `mcat_read`, `ml_read`, `mlv_read`, `mr_select_public` |
| Append-only (insert+select only, no update/delete grants) | ✅ `audit_log`, `tracking_event_log`, `order_edits` |
| Tables with `FORCE RLS` BUT **no explicit `GRANT … to app_runtime`** | ⚠ **4 tables** — see Gap §A |

**Tenant-isolation policy loop** (`02_policies.sql:65–88`) hard-codes the canonical table list at install time. Every migration that adds a tenant-scoped table after `02_policies.sql` was applied MUST ship its own `GRANT … to app_runtime` (because `alter default privileges` in `02_policies.sql:56–59` only fires when objects are created by the `postgres` role, the same role that ran the `02` migration — objects created in later files by the same role may still benefit, but the pattern is inconsistent enough that `22_dbid.sql:80` explicitly calls it out as a foot-gun). See Gap §A for the audit of which tables forgot this.

**Notable RLS design choices:**
- `cart_reminder` (`20_abandoned_carts.sql:51`) — only `SELECT` policy, **no INSERT/UPDATE/DELETE policy**. With `FORCE RLS`, that means **writes are impossible for `app_runtime`**, but no explicit `GRANT … to app_runtime` exists either, so writes also fail at the grant level. Cart-reminder writing must therefore go through `asPlatformAdmin()` (superuser bypasses RLS) — confirmed intent but worth documenting.
- `audit_log` (`17_audit_log.sql:62–69`) — `SELECT` policy only, `grant select on audit_log to app_runtime`, no INSERT/UPDATE/DELETE grants. Comment at `:67–69` explicitly says writes happen via `asPlatformAdmin()` so the actor's identity is captured separately. This is intentional.
- `tracking_event_log` (`16_tracking_event_log.sql:57`) — `grant select, insert` (no update/delete) + RLS forced. Comment: *"delete/update blocked — events are append-only."* Intentional.
- `order_edits` (`31_o3_edit_order.sql:98`) — `grant select, insert` only. Comment: *"No UPDATE / DELETE grants — append-only."* Intentional.
- `dbid_submission` (`22_dbid.sql:88`) — single `FOR ALL` policy keyed on tenant_id. Matches canonical pattern; the migration documents the policy name difference (`dbid_submission_isolation` vs `<tbl>_isolation`) as cosmetic.

---

## 4. Relations Map (parent → child with cascade)

Notation: `C` = `ON DELETE CASCADE`, `S` = `ON DELETE SET NULL`, `R` = `ON DELETE RESTRICT`, `(default)` = `ON DELETE NO ACTION`.

### 4.1 Tenant cascade (the root of every tenant-scoped table)

**`tenant` (`01_schema.sql:105`)** → cascades to **every tenant-scoped table** via `tenant_id … references tenant(id) on delete cascade`. There are **40+ such FKs** (see the `tenant_id.*on delete cascade` regex hits in the source). Deleting a tenant wipes the entire tenant dataset — orders, products, customers, shipments, audit, returns, segments, etc. **No table has `tenant_id` with `SET NULL` or `RESTRICT`** — the cascade is universal by design.

### 4.2 Critical cascade matrix (with destruction-risk flag)

| Parent table | Child table | FK col | On delete | Risk |
|---|---|---|---|---|
| `app_user` | `tenant_member` (`01_schema.sql:130`) | `user_id` | **CASCADE** | ⚠ **Deleting a `app_user` deletes every membership row across every tenant they belonged to. Combined with `tenant.owner_user_id` being `SET NULL` (line 114), the user account disappears but the tenant survives. Membership loss may silently break their access on next login.** |
| `app_user` | `user_session` (`06_own_auth.sql:49`) | `user_id` | CASCADE | ✅ Intentional — delete user → kill their sessions |
| `app_user` | `otp_code` (`06_own_auth.sql:73`) | `user_id` | CASCADE | ✅ Intentional (column is nullable for pre-signup) |
| `app_user` | `platform_member` (`14_platform_team.sql:21`) | `user_id` (PK) | CASCADE | ✅ Intentional — platform staff leave Hybrid, drop their platform role |
| `app_user` | `tenant_assignment` (`14_platform_team.sql:30`) | `user_id` | CASCADE | ⚠ **Account-manager goes → their entire portfolio of tenant assignments is dropped silently. No reassignment step.** |
| `tenant` | `tenant_theme_settings.theme_id → theme` (`01_schema.sql:178`) | `theme_id` | **RESTRICT** | ✅ Correct — global theme catalog protected from accidental drop |
| `orders` | `shipment` (`01_schema.sql:539`) | `order_id` | CASCADE | ⚠ **Deleting an order wipes shipments, return_requests, return_items, auto_cancel_log, sla_alert_log, order_edits. Multiple cascades funnel into `orders` deletion.** |
| `orders` | `payment` (`01_schema.sql:489`) | `order_id` | CASCADE | ⚠ Order deletion destroys payment history (audit-evidence loss) |
| `orders` | `return_request` (`09_returns.sql:42`) | `order_id` | CASCADE | ⚠ Same audit-evidence loss |
| `orders` | `auto_cancel_log` (`30_auto_cancel.sql:51`) | `order_id` | CASCADE | ⚠ Audit-evidence loss |
| `orders` | `sla_alert_log` (`28_sla.sql:57`) | `order_id` | CASCADE | ⚠ Audit-evidence loss |
| `orders` | `order_edits` (`31_o3_edit_order.sql:43`) | `order_id` | CASCADE | ⚠ Audit-evidence loss |
| `product` | `product_image` (`01_schema.sql:272`) | `product_id` | CASCADE | ✅ Merchant deleted the product → delete the gallery |
| `product` | `product_variant` (`01_schema.sql:283`) | `product_id` | CASCADE | ✅ Same — but order_item.variant_id uses `SET NULL` (`:439`) so historical orders preserve the line |
| `product` | `order_item` (`01_schema.sql:438`) | `product_id` | SET NULL | ✅ Order history preserved when product is deleted |
| `product_variant` | `order_item` (`01_schema.sql:439`) | `variant_id` | SET NULL | ✅ Same |
| `product` | `product_collection` (`01_schema.sql:308`) | `product_id` | CASCADE | ✅ Pivot row drops with the product |
| `product` | `marketplace_listing` (`22_marketplace.sql:99`) | `product_id` | CASCADE | ✅ Listing projection dies with the source product |
| `customer` | `orders.customer_id` (`01_schema.sql:396`) | `customer_id` | SET NULL | ✅ Order history preserved |
| `customer` | `customer_address` (`01_schema.sql:345`) | `customer_id` | CASCADE | ✅ Addresses owned by the customer |
| `customer` | `cart.customer_id` (`20_abandoned_carts.sql:8`) | `customer_id` | SET NULL | ✅ Cart preserved as guest cart |
| `customer` | `sms_log.customer_id` (`27_comm_log.sql:18`) | `customer_id` | SET NULL | ⚠ Communication history preserved (comment at `:21` confirms intent: *"kept even if customer row is later deleted"*) |
| `customer` | `email_log.customer_id` (`27_comm_log.sql:47`) | `customer_id` | SET NULL | ⚠ Same |
| `marketplace_customer` | `marketplace_session` (`22_marketplace.sql:160`) | `buyer_id` | CASCADE | ✅ Buyer deleted → kill sessions |
| `marketplace_customer` | `marketplace_order` (`22_marketplace.sql:175`) | `buyer_id` | **RESTRICT** | ✅ Correct — buyer with order history cannot be hard-deleted |
| `marketplace_order` | `marketplace_suborder` (`22_marketplace.sql:201`) | `marketplace_order_id` | CASCADE | ✅ Sub-orders die with the parent saga |
| `marketplace_suborder` | `marketplace_commission` (`22_marketplace.sql:245`) | `suborder_id` | SET NULL | ✅ Commission ledger preserves history if suborder dropped |

### 4.3 Polymorphic / value-link relations (no FK across RLS boundary)

The marketplace deliberately uses **value links** instead of cross-schema FKs because tenant-owned `orders` lives behind RLS and a hard FK would break the marketplace buyer's read path. The codebase explicitly documents this trade-off.

- `orders.marketplace_order_id` (`01_schema.sql:420`) — **NO FK** to `marketplace_order(id)`. Indexed at `01_schema.sql:432` and `22_marketplace.sql:45`. Cross-schema integrity check is application-layer; a buyer-facing sub-order link can dangle if a tenant `orders` row is hard-deleted (cascaded via tenant cascade). This is intentional — the parent `marketplace_order` survives tenant deletion in theory, but in practice `marketplace_suborder.tenant_id` also cascades with the tenant (`22_marketplace.sql:203`), so the link becomes stale. **Gap §I — no integrity check on the value link.**
- `marketplace_suborder.order_id` (`22_marketplace.sql:205`) — **NO FK** to `orders(id)`. Same rationale. Indexed at `:218`.
- `audit_log.resource_id` (`01_schema.sql:643`) — text column, polymorphic. No integrity constraint by design (the resource could be a uuid or a numeric order number per `:46` comment).

### 4.4 `tenant_assignment` ↔ `platform_member`

`tenant_assignment.user_id` (`14_platform_team.sql:30`) → `app_user(id)` **cascade**, and `platform_member.user_id` (`14_platform_team.sql:21`) → `app_user(id)` **cascade**. No FK between `tenant_assignment` and `platform_member`, so an account-manager can exist in `tenant_assignment` without a `platform_member` row (and vice-versa). This is the documented design — the platform-admin flag on `app_user` is the coarse gate, `platform_member.role` is the granular role.

### 4.5 Wrong-table FKs (cross-schema contamination)

These three FKs reference `auth.users(id)` instead of the canonical `app_user(id)`:

| Location | Column | References | Severity |
|---|---|---|---|
| `28_sla.sql:40` | `orders.sla_overridden_by` | `auth.users(id) ON DELETE SET NULL` | **CRITICAL** |
| `28_sla.sql:69` | `sla_alert_log.recipient_user_id` | `auth.users(id) ON DELETE SET NULL` | **CRITICAL** |
| `29_manual_refund.sql:35` | `return_request.initiated_by` | `auth.users(id) ON DELETE SET NULL` | **CRITICAL** |

See Gap §A for full rationale and impact. The codebase went off Supabase Auth in `06_own_auth.sql` (header confirms), but these three columns were added in later sprint-1 migrations and the author reached for the Supabase-shaped FK by mistake. **The DB WILL fail to migrate** on any Postgres without a GoTrue-blessed `auth.users` table.

---

## 5. Gaps Found

### §A — Missing `app_runtime` grants on RLS-forced tables  (HIGH)

**Evidence:**
- `01_schema.sql:654` creates `webhook_event` — no `GRANT … to app_runtime` in `01_schema.sql` or any later file.
- `19_order_assignee.sql:16` creates `order_note` — `grep grant 19_order_assignee.sql` → 0 hits.
- `20_abandoned_carts.sql:5, :36` create `cart` and `cart_reminder` — `grep grant 20_abandoned_carts.sql` → 0 hits.

**Impact:** Every later-created table inherits `FORCE RLS` (good), but `app_runtime` has no grant on it. Runtime traffic hits `ERROR: permission denied for table …`. The exact pattern is documented in `22_dbid.sql:80–88` (`GRANT + RLS policy (FIX): this migration (22) runs AFTER 02_policies.sql's one-time "grant on all tables in schema public to app_runtime", so a table created here was never covered…`). Migrations `19`, `20`, and the original `01_schema.sql:654` missed the same fix.

**Fix:** Add explicit `grant select, insert, update, delete on cart, cart_reminder, order_note, webhook_event to app_runtime;` in a new migration.

### §B — `size_chart` trigger calls non-existent function `app.touch_updated_at()`  (HIGH)

**Evidence:** `34_r3_size_chart.sql:64` — `for each row execute function app.touch_updated_at();`

The canonical function is `public.set_updated_at()`, defined at `01_schema.sql:28`. `app.touch_updated_at()` does not exist anywhere in the schema (verified by grep). The create is guarded inside a `do $$ … if not exists …` block at `:56–66`, so it **silently fails** on first apply (the `create trigger` raises an error and the surrounding block aborts mid-way, leaving the table without the trigger). On idempotent re-runs after a failed first apply, the if-not-exists check passes (no trigger exists), so it errors again.

**Fix:** Change `app.touch_updated_at()` → `set_updated_at()` in `34_r3_size_chart.sql:64`.

### §C — Three FKs to `auth.users(id)` instead of `app_user(id)`  (CRITICAL)

**Evidence:** See §4.5 above. `28_sla.sql:40, :69` and `29_manual_refund.sql:35`.

**Impact:**
1. **On fresh DB without an `auth.users` table** (vanilla Postgres, or a future Supabase config that doesn't create GoTrue): the migrations fail with `relation "auth.users" does not exist` and the entire migration runner aborts.
2. **On self-hosted Supabase where `auth.users` exists** (current production): the FK resolves against GoTrue's user table, but Hybrid's runtime `app.current_user_id()` returns an `app_user.id`, not an `auth.users.id`. The three columns (SLA overrides, SLA alert recipients, manual-refund initiator) will store GoTrue uuids that have no row in `app_user` — the audit trail is corrupted (orphan user ids).
3. **RLS on `app_user` (`02_policies.sql:112`) is keyed on `id = app.current_user_id()`**, so even if a GoTrue uuid matches an `app_user.id` by accident, the integrity model is broken (these are different namespaces).

**Fix:** `ALTER TABLE orders DROP COLUMN sla_overridden_by; ALTER TABLE orders ADD COLUMN sla_overridden_by uuid references app_user(id) on delete set null;` and same for the other two columns.

### §D — `audit_action` enum defined twice  (LOW, idempotent)

**Evidence:**
- `01_schema.sql:631–636` declares `audit_action` enum (14 values).
- `17_audit_log.sql:18–38` redeclares the SAME enum (also 14 values) inside `do $$ begin … exception when duplicate_object then null; end $$;`.

**Impact:** Migration order matters. If `01_schema.sql` runs first (normal order), the `17` block silently no-ops on the enum declaration and proceeds to create the table. If a fresh DB applies `17` standalone (e.g. for testing), the table+enum are created cleanly. **No data corruption**, but the duplication is a maintenance hazard — adding a new value to one file but forgetting the other (which already happened: `31_o3_edit_order.sql:33` adds `'order.update'` and `23_dbid_audit.sql:13, :18` adds `'dbid.review_approve/reject'` to the canonical 01 schema version; the `17` copy is stale). If a future ops path runs `17` first against an empty DB, those four new enum values would be missing.

**Fix:** Strip the duplicate `create type audit_action as enum …` block from `17_audit_log.sql:18–38`. Keep the `create table if not exists` + indexes + RLS.

### §E — `dbid_submission` not in `02_policies.sql` tenant_tables array  (MEDIUM, behaviourally fine)

**Evidence:** `02_policies.sql:67–77` lists every tenant-scoped table that gets the canonical RLS+FORCE+policy applied. `dbid_submission` (created in `22_dbid.sql:17`) is not in that list.

**Impact:** None at runtime — `22_dbid.sql:70–71, :88` ships its own `enable + force row level security` + `create policy dbid_submission_isolation`, which mirrors the canonical pattern. The deviation is purely that the policy name is `dbid_submission_isolation` (the `_isolation` suffix is the same) and the migration isn't listed in the canonical loop. Future audits that parse only `02_policies.sql` will mis-count the coverage.

**Fix:** Add `dbid_submission` to the `tenant_tables` array in `02_policies.sql` if you want a single source of truth. (Behaviourally equivalent to current state.)

### §F — `tenant_id` partial unique indexes leave the general RLS predicate unindexed for SOME rows  (MEDIUM)

**Evidence:** `08_perf_indexes.sql:39–49` documents that 10 tenant-scoped tables originally had only partial/leading-non-tenant indexes. The migration patches the gap by adding 10 `(tenant_id)` indexes. But two more were added later and **were not covered by `08`**:

- `cart` (`20_abandoned_carts.sql:20–22`) — `create index if not exists cart_tenant_idx on cart (tenant_id, updated_at desc) where recovered_at is null` — partial on `recovered_at is null`. A recovered cart (no longer partial-unique target) has NO leading-`tenant_id` index. Small data, low impact.
- `cart_recovery_pending_idx` (`36_o16_cart_recovery.sql:43`) — partial on `abandoned_at is not null and recovered_at is null and recovery_attempts < 3`. Same pattern.
- `marketplace_fee` (`25_marketplace_fee.sql:20`) — has `tenant_id` but no leading-`tenant_id` index. **However**, its policy is `marketplace_fee_admin` (`25_marketplace_fee.sql:42`) keyed on `app.is_platform_admin()`, not `tenant_id` — so the RLS predicate is `app.is_platform_admin()` and an index on `tenant_id` would not help anyway. Fine.
- `marketplace_review` (`22_marketplace.sql:223`) — has `tenant_id` but only indexes are `(product_id, status)` and `(tenant_id, status)` (`22_marketplace.sql:236–237`). The latter serves the vendor's RLS predicate. Adequate.

**Impact:** Low — these are by-design partial indexes for hot queries. The general-RLS-predicate concern doesn't apply because (a) partial tables are small, (b) the only one that needs `tenant_id` leading (`marketplace_fee`) has an admin-only policy.

**Fix:** None required. Worth noting in `08_perf_indexes.sql` as a future-audit reminder.

### §G — `updated_at` triggers NOT installed on most post-`01_schema` tables  (MEDIUM)

**Evidence:** The canonical trigger loop in `01_schema.sql:670–685` covers only the 23 tables defined in `01_schema.sql`. Every migration that adds a new table with `updated_at timestamptz not null default now()` (which is the documented convention) **does not** add a corresponding `_set_updated_at` trigger. Verified by grep:

| Table | Has `updated_at`? | Has trigger? | File |
|---|---|---|---|
| `dbid_submission` | ✅ | ✅ (custom — `dbid_submission_set_updated_at`) | `22_dbid.sql:62` |
| `purchase_request` | ✅ | ✅ (custom — `purchase_request_set_updated_at`) | `24_wholesale.sql:167` |
| `size_chart` | ✅ | ❌ (BROKEN — calls non-existent function — Gap §B) | `34_r3_size_chart.sql:62–66` |
| `cart` | ✅ | ❌ | `20_abandoned_carts.sql:15` |
| `cart_reminder` | ❌ has `created_at` only | n/a | `20_abandoned_carts.sql:42` |
| `order_note` | ❌ has `created_at` only | n/a | `19_order_assignee.sql:22` |
| `tracking_event_log` | ❌ has `occurred_at` only | n/a | `16_tracking_event_log.sql:30` |
| `return_request` | ✅ | ❌ | `09_returns.sql:53` |
| `return_item` | ❌ has `created_at` only | n/a | `09_returns.sql:71` |
| `phone_blocklist` | ❌ has `created_at` only | n/a | `10_fraud.sql:20` |
| `campaign` | ❌ has `created_at` + `sent_at` only | n/a | `11_marketing.sql:22–23` |
| `product_review` | ❌ has `created_at` + `moderated_at` only | n/a | `12_reviews.sql:20–21` |
| `loyalty_program` | ✅ | ❌ | `13_loyalty.sql:16` |
| `loyalty_ledger` | ❌ has `created_at` only | n/a | `13_loyalty.sql:26` |
| `platform_member` | ✅ | ❌ | `14_platform_team.sql:24` |
| `tenant_assignment` | ❌ has `assigned_at` only | n/a | `14_platform_team.sql:31` |
| `platform_expense` | ❌ has `created_at` + `incurred_on` only | n/a | `15_platform_finance.sql:18` |
| `order_note` | ❌ has `created_at` only | n/a | `19_order_assignee.sql:22` |
| `shipping_config` | ✅ | ❌ | `21_shipping.sql:27` |
| `shipping_zone_rate` | ✅ | ❌ | `21_shipping.sql:37` |
| `marketplace_config` | ✅ | ❌ | `22_marketplace.sql:58` |
| `marketplace_category` | ❌ has `created_at` only | n/a | `22_marketplace.sql:72` |
| `marketplace_listing` | ❌ has `synced_at` only | n/a | `22_marketplace.sql:119` |
| `marketplace_listing_variant` | ❌ (no timestamps at all) | n/a | `22_marketplace.sql:140` |
| `marketplace_customer` | ✅ | ❌ | `22_marketplace.sql:153` |
| `marketplace_session` | ❌ has `created_at` only | n/a | `22_marketplace.sql:166` |
| `marketplace_order` | ✅ | ❌ | `22_marketplace.sql:189` |
| `marketplace_suborder` | ✅ | ❌ | `22_marketplace.sql:214` |
| `marketplace_review` | ❌ has `created_at` + `moderated_at` only | n/a | `22_marketplace.sql:232–233` |
| `marketplace_commission` | ❌ has `created_at` only | n/a | `22_marketplace.sql:250` |
| `customer_ledger` | ❌ has `created_at` only | n/a | `24_wholesale.sql:133` |
| `marketplace_fee` | ❌ has `created_at` + `paid_at` only | n/a | `25_marketplace_fee.sql:28` |
| `customer_segment` | ❌ has `created_at` only | n/a | `26_customer_segment.sql:17` |
| `sms_log` | ❌ has `sent_at` only | n/a | `27_comm_log.sql:33` |
| `email_log` | ❌ has `sent_at` only | n/a | `27_comm_log.sql:55` |
| `sla_alert_log` | ❌ has `sent_at` only | n/a | `28_sla.sql:71` |
| `auto_cancel_log` | ❌ has `cancelled_at` only | n/a | `30_auto_cancel.sql:59` |
| `order_edits` | ❌ has `occurred_at` only | n/a | `31_o3_edit_order.sql:58` |
| `product_video` | ❌ has `created_at` only | n/a | `33_r1_video.sql:34` |

**Impact:** Every `updated_at` column that lacks a trigger is silently frozen at the row's insert time. App code that depends on `updated_at` for "last-modified" ordering (admin lists, cache invalidation, optimistic-concurrency ETags) will see stale values. 13+ tables are affected.

**Fix:** Either (a) extend the canonical trigger loop in `01_schema.sql` to run again at the end of every later migration that creates a table with `updated_at`, or (b) add a one-shot corrective migration that adds `_set_updated_at` triggers to every `updated_at` column missing one.

### §H — JSONB columns that should arguably be normalized (or vice-versa)  (LOW)

**Evidence:** Many tenant-scoped tables store rich, structured payloads as JSONB. Cases where this is reasonable vs. a normalization hazard:

| JSONB column | File:line | Concern |
|---|---|---|
| `orders.shipping_address` (`jsonb`) | `01_schema.sql:400` | Snapshot of the address — intentional, preserves historical accuracy if the customer moves. ✅ |
| `orders.billing_address` (`jsonb`) | `01_schema.sql:401` | Same. ✅ |
| `orders.credit_terms` (`jsonb`) | `01_schema.sql:407` | Wholesale credit terms — flexible per-tenant shape. ✅ |
| `product.options` (`[{name, values}]`) | `01_schema.sql:259` | Variants are decomposed into `product_variant.options` (`01_schema.sql:291`), so this is the schema. Reasonable. |
| `product_variant.options` (`{size, color}`) | `01_schema.sql:291` | Could be normalized into `product_variant_option (variant_id, name, value)` but the JSONB form is a Shopify-style contract and indexed via `search_tsv` on the marketplace projection. Reasonable. |
| `product_variant.tier_prices` (`[{min_qty, unit_price}]`) | `01_schema.sql:288` | Wholesale tier pricing — flexible per-merchant. ✅ |
| `discount.applies_to` (`{scope: all | collection_ids | product_ids}`) | `01_schema.sql:373` | Polymorphic — could be normalized into a separate `discount_target` table for FK integrity. **Gap candidate** but documented pattern. |
| `tenant.settings` (catch-all) | `01_schema.sql:120` | Free-form per-tenant settings. Repeatedly noted as the legacy catch-all ("`vatBin`" example in `32_o13_tin_bin.sql:29`). Some keys have since been promoted to first-class columns (TIN/BIN in `32`, KYC fields in `24`, cart-recovery in `36`, stock-alert in `37`, order-tag vocabulary in `38`). Reasonable as the "scratchpad" while keys stabilize. |
| `tenant.kyc_documents` | `24_wholesale.sql:34` | Free-form JSONB despite DBID being a structured object with first-class columns in `dbid_submission`. Some duplication risk. **Gap candidate** — DBID data lives in two places. |
| `payment_account.credentials` / `courier_account.credentials` | `01_schema.sql:480, :517` | Sealed envelope (encrypted app-layer). JSONB is correct. ✅ |
| `payment.payload` | `01_schema.sql:495` | Webhook payload snapshot. ✅ |
| `shipment.payload` | `01_schema.sql:552` | Courier response payload. ✅ |
| `webhook_event.payload` | `01_schema.sql:660` | Inbound webhook body. ✅ |
| `analytics_event.payload` | `01_schema.sql:620` | Type-tagged event body. ✅ |
| `cart.items` (`[{productId, variantId, title, qty, unitPrice}]`) | `20_abandoned_carts.sql:11` | Cart line items. Could be normalized into `cart_item (cart_id, …)` to track per-line abandonment, but the current shape is intentional for the "send-the-same-cart-back-via-recovery_token" recovery flow. ✅ |
| `purchase_request.items` (`[{…}]`) | `24_wholesale.sql:109` | Same as cart. ✅ |
| `order_edits.before / after` (`{order_item.id → {qty, unit_price, line_total}}`) | `31_o3_edit_order.sql:50–51` | Edit audit snapshot. JSONB is the only sane shape (it's the diff). ✅ |
| `marketplace_listing.search_tsv` (tsvector, generated) | `22_marketplace.sql:114` | Search index column — generated, persisted. ✅ |

**Net assessment:** the JSONB usage is consistently intentional. The two watch-list items are `discount.applies_to` (polymorphic, weak integrity) and `tenant.kyc_documents` (overlaps with `dbid_submission` first-class columns). Neither is broken, both are future-tightening candidates.

### §I — `orders.marketplace_order_id` and `marketplace_suborder.order_id` are value links without integrity check  (LOW)

**Evidence:** See §4.3 above. The codebase explicitly trades FK integrity for cross-RLS-bounds reads.

**Impact:** If a tenant `orders` row is hard-deleted (tenant cascade from a deleted tenant), `marketplace_suborder.order_id` becomes a dangling uuid. The marketplace buyer's "View my orders" UI may then display a sub-order that has no backing order. Detection requires a reconciliation job.

**Fix:** A nightly reconciliation job that flags `marketplace_suborder WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders WHERE id = …)` — but note that the latter query is blocked by RLS for buyer-context, so the reconciliation must run via `asPlatformAdmin()`.

### §J — No unique constraint on `orders.discount_code`  (LOW)

**Evidence:** `01_schema.sql:417` — `discount_code text` (nullable). The reference to `discount.code` is a text value link, not an FK, and there's no application-level enforcement of "this code must come from the `discount` table".

**Impact:** An order can carry a discount code that has been disabled / expired / deleted. The storefront UI presumably revalidates at order placement, but the DB layer doesn't enforce it.

**Fix:** Optional FK `references discount(tenant_id, code)` (compound because discount.code is `UNIQUE (tenant_id, code)`). Compound FK is awkward; alternatively a CHECK + trigger.

### §K — Missing NOT NULL where business logic requires  (LOW)

| Column | File:line | Should be? |
|---|---|---|
| `order_item.title` | `01_schema.sql:440` | Already NOT NULL ✅ |
| `order_item.variant_title` | `01_schema.sql:441` | Nullable — but the order line MUST have a `title` snapshot (`:440` is NOT NULL). Variants can disappear after order placement (`SET NULL`), so a NULL variant_title is plausible if the snapshot wasn't taken. ⚠ minor |
| `orders.customer_name`, `customer_phone` | `01_schema.sql:397–398` | Both nullable, but `customer_id` is also nullable (`:396`). A "guest checkout" pathway is plausible for COD, so nullable is reasonable. ✅ |
| `customer.email` | `01_schema.sql:324` | Nullable — phone is the BD natural key (`02_policies.sql` `customer_phone_uniq` is partial). ✅ |
| `customer.phone` | `01_schema.sql:323` | Nullable — but the index `customer_phone_uniq` is `WHERE phone IS NOT NULL`. A customer without a phone is essentially anonymous; storefront listings will struggle. ⚠ soft requirement |
| `app_user.full_name` | `01_schema.sql:96` | Nullable — fine, signup can be phone-only OTP |
| `tenant_member.invited_at` / `accepted_at` | `01_schema.sql:132–133` | Both nullable — `accepted_at IS NULL` is a "pending invite" sentinel. ✅ |
| `shipment.consignment_id` | `01_schema.sql:541` | Nullable — courier returns this after creation; pre-create it's unknown. ✅ |
| `subscription.current_period_start / end` | `01_schema.sql:571–572` | Nullable — a tenant can be `trialing` before the first period. ✅ |
| `analytics_event.session_id` / `customer_id` | `01_schema.sql:618–619` | Both nullable — anonymous events + `SET NULL` on customer delete. ✅ |
| `audit_log.tenant_id` | `01_schema.sql:639` | Nullable — platform-level events (`platform_admin.login`). Comment at `:626` confirms. ✅ |
| `webhook_event.tenant_id` | `01_schema.sql:656` | Nullable — gateway webhooks can arrive before tenant resolution. ✅ |
| `dbid_submission.tin / bin` | `32_o13_tin_bin.sql:40–41` | Nullable by design — fresh trial tenants don't have them. CHECK constraints on format at `:53–56`. ✅ |

**Net:** the NULL usage is consistently intentional. No high-priority gaps.

### §L — Seed/data-only files mixed into schema files  (NONE FOUND)

**Evidence:** `03_seed.sql` is the only seed file; it is a separate filename (`03_` is also the canonical seed slot per `migrate.ts` convention). All other migrations contain DDL + RLS + grants only — no `INSERT INTO … VALUES …` data. Verified by `grep -n "INSERT INTO" /root/Hybrid/packages/db/sql/*.sql | grep -v 03_seed.sql` → only `03_seed.sql` matches.

**Exception:** `22_marketplace.sql:77–90` inserts the canonical 12-row `marketplace_category` taxonomy inline in the migration (not in `03_seed.sql`). Comment at `:75–76` explains: *"Lives in the migration (not 03_seed) so it exists regardless of seed-vs-migrate ordering."* This is intentional — the taxonomy is reference data that the marketplace projection depends on, so it can't be in a seed-only path.

**Exception:** `07_phase2.sql:22–25` does not insert, just `ALTER TABLE … ADD COLUMN … DEFAULT 'pending'` — pure schema.

No problematic seed data found.

### §M — `order_note` policy hardcodes `app.current_user_id()` for delete  (LOW)

**Evidence:** `19_order_assignee.sql:45–49` — the DELETE policy requires `author_id = app.current_user_id() or app.is_platform_admin()`. The other order_note policies (select / update) only check `tenant_id = app.current_tenant_id()`. So a tenant member can edit ANY note on ANY order in their tenant, but only delete their own (or platform admin can delete anyone's). Likely intentional ("you can edit your team's notes but not delete someone else's"), but worth confirming with the product team.

**Fix:** None — behaviour is documented in the migration comment `:30–31`. Just flagging for visibility.

### §N — `marketplace_suborder.order_id` and `order_number` are snapshots, not live links  (LOW, by design)

**Evidence:** `22_marketplace.sql:206–207` — `order_id uuid, order_number bigint` with comments *"value-link into tenant orders"* and *"snapshot"*. A nightly sync job keeps these in sync; the migration does not enforce it.

**Impact:** Buyer sees a stale order number if the sync lag > a few seconds. Acceptable for marketplace UX. The reconciliation pattern is documented at `:198` (*"The fulfillment status is synced back here by the admin hook + reconcile cron"*).

**Fix:** None — this is the documented design.

### §O — `discount.code` unique constraint is per-tenant (`unique (tenant_id, code)`) but the order-line `discount_code` is a plain text — no constraint that it matches a row in `discount`  (LOW)

**Evidence:** `01_schema.sql:379` defines `unique (tenant_id, code)` on `discount`. `01_schema.sql:417` stores `orders.discount_code text` with no FK.

Same root cause as Gap §J — value-link without integrity check.

---

## 6. Open Questions

These are questions the audit cannot answer from migrations alone; resolving them requires either (a) running psql against the live DB, or (b) reading the application code:

1. **Live DB RLS state.** Is every migration listed in this audit actually applied to production? Specifically: do `dbid_submission`, `product_video`, `size_chart`, `order_note` exist on the live DB with their policies installed? (The migrations are gated by a `migrate.ts` ledger per their headers.) Cannot verify without psql.
2. **`auth.users` exists on the live DB.** Self-hosted Supabase creates `auth.users` via GoTrue init. If yes, the three wrong-table FKs (Gap §C) silently store GoTrue uuids; if no, the migrations fail to apply. **Critical to check on the live DB.**
3. **`set_updated_at()` trigger coverage on the live DB.** Has anyone hand-applied the missing triggers listed in Gap §G, or do those tables genuinely have frozen `updated_at` values? The migration files say they don't exist; the live DB might differ.
4. **`customer_order_seq` (the `order_counter` upsert path)** — `01_schema.sql:451–468` — is the `assign_order_number()` trigger firing as expected under RLS? The seed file (`03_seed.sql:16–17`) explicitly says *"order_counter is intentionally NOT pre-seeded so the RLS suite exercises the assign_order_number() trigger's INSERT … ON CONFLICT path under RLS."* Cannot verify RLS behaviour from the SQL files alone — requires a test run.
5. **`webhook_event` RLS at scale.** The table is **nullable `tenant_id` + nullable `provider` + unique `(provider, external_id)`**. With `enable + force RLS`, the policy `webhook_event_isolation` (`02_policies.sql:84`) filters on `tenant_id = app.current_tenant_id() OR app.is_platform_admin()`. For a tenant whose `tenant_id` is NULL in a row, only `app.is_platform_admin()` can see it — which is correct (pre-resolution webhooks). But is `app_runtime_login` (the runtime role) actually able to INSERT into `webhook_event` given the missing grant (Gap §A)? The webhook ingestion path runs via `asPlatformAdmin()` so likely yes, but worth confirming the production webhook receiver role.
6. **`marketplace_fee` is admin-only** (`25_marketplace_fee.sql:42` `using (app.is_platform_admin())`). The marketplace-merchant UI presumably needs to read its own fee rows. Is there a future-facing policy on the roadmap, or does the merchant always see the value via `tenant.marketplace_monthly_fee`? Cannot tell from migrations alone.
7. **`tenant_member.user_id` ON DELETE CASCADE** (`01_schema.sql:130`) — what is the actual `app_user` deletion policy at the application layer? If a merchant "deletes" their account via a soft-delete column that doesn't exist, the membership survives; if a hard DELETE is used, the merchant loses every tenant membership silently (Gap §4.2). Migrations say `app_user` is the auth authority but have no soft-delete pattern.
8. **`marketplace_suborder` status sync** — `22_marketplace.sql:207` stores `status text not null default 'confirmed'` with the comment *"snapshot of fulfillment_status"*. Is the snapshot actually maintained by the admin hook + reconcile cron? No DB trigger does it.
9. **`dbid_submission` foreign-keyed to `tenant` with `unique (tenant_id)`** (`22_dbid.sql:19`) — but `tenant` is the platform-level table. This means a tenant has AT MOST ONE DBID submission, ever. If a tenant's DBID is rejected, the row gets updated (via `status = 'rejected'`), not re-submitted. Is this the intended workflow, or should resubmission create a new row + archive the old?
10. **`audit_log` mutation gap** — `17_audit_log.sql:68–69` says *"No INSERT/UPDATE/DELETE policies — only asPlatformAdmin() can write"*. But `02_policies.sql:74` already applies the canonical tenant_isolation policy to `audit_log` (it's in the `tenant_tables` array at `:77`). So `audit_log` has TWO policies: the canonical one from `02` and the explicit one from `17` (`audit_log_tenant_read`). With `FORCE RLS`, both apply; the canonical policy is a `FOR ALL USING (tenant_id = …)` (covers all verbs), the explicit one is `FOR SELECT` only (more permissive on SELECT, but redundant since canonical covers SELECT too). Result: SELECT is OR'd (idempotent), but the canonical policy would block INSERT/UPDATE/DELETE because `tenant_id = app.current_tenant_id()` doesn't have `with check` unless you SET the tenant_id correctly. The behaviour is probably correct (writes must use `asPlatformAdmin`), but the duplicated policy is a maintenance hazard (Gap §D-adjacent).

---

## Appendix A — Method & Data Provenance

- All `.sql` files in `/root/Hybrid/packages/db/sql/` were read in full, in lexical order: `00_roles.sql` → `01_schema.sql` → `02_policies.sql` → `03_seed.sql` → `04_grant_login.sql` → `06_own_auth.sql` → `07_phase2.sql` → `08_perf_indexes.sql` → `09_returns.sql` → `10_fraud.sql` → `11_marketing.sql` → `12_reviews.sql` → `13_loyalty.sql` → `14_platform_team.sql` → `15_platform_finance.sql` → `16_tracking_event_log.sql` → `17_audit_log.sql` → `18_order_notify.sql` → `19_order_assignee.sql` → `20_abandoned_carts.sql` → `21_shipping.sql` → `22_dbid.sql` → `22_marketplace.sql` → `23_dbid_audit.sql` → `23_hybridpay.sql` → `24_wholesale.sql` → `25_marketplace_fee.sql` → `26_customer_segment.sql` → `27_comm_log.sql` → `28_sla.sql` → `29_manual_refund.sql` → `30_auto_cancel.sql` → `31_o3_edit_order.sql` → `32_o13_tin_bin.sql` → `33_r1_video.sql` → `34_r3_size_chart.sql` → `35_o7_ndr.sql` → `36_o16_cart_recovery.sql` → `37_r7_stock_alert.sql` → `38_o9_order_tags.sql` → `40_product_barcode.sql` → `41_delivery_slot.sql` → `42_pickup.sql` → `43_preorder.sql`.
- Down migrations (`sql/down/*.down.sql`) were not deep-read — they only run on rollback, which is not the canonical state.
- Project context was sourced from `/root/Hybrid/CLAUDE.md` (canonical context file).
- All findings are anchored to `file:line` references in the SQL files. No findings are based on guessing or prior knowledge.
- Live DB was **NOT verified**: `nc -zv 127.0.0.1 5442` → "Connection refused"; `nc -zv 72.62.228.196 5432` → "Connection timed out". `psql` (v16.14) is installed but has no reachable target.
- The `.env.local` DATABASE_URL points to `app_runtime_login@127.0.0.1:5442/hybrid` (local embedded Postgres — not running) and DIRECT_URL to `postgres@127.0.0.1:5442/hybrid`. The production DATABASE_URL (VPS) is not present in any `.env` file in this workspace, so the audit could not attempt to connect to the live system.

**No edits made.** This is a read-only audit.