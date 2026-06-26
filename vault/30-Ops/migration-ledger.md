---
type: ops
updated: 2026-06-26
---

# DB migration ledger

Idempotent additive SQL in `packages/db/sql/NN_name.sql`, applied by lexical prefix, tracked in
`_migrations`. Migrations/seed use `DIRECT_URL` (`postgres`, BYPASSRLS). Rollbacks in `sql/down/`.

| # | file | what | feature |
|---|---|---|---|
| 00–05 | roles/schema/policies/seed/grant/auth | multi-tenant spine | — |
| 06–08 | perf indexes, etc. | Phase 1/2 | — |
| 09 | `09_returns.sql` | returns / RTO | tenant P1 |
| 10 | `10_fraud.sql` | phone blocklist | tenant P1 |
| 11 | `11_marketing.sql` | campaigns | tenant P2 |
| 12 | `12_reviews.sql` | product reviews | tenant P2 |
| 13 | `13_loyalty.sql` | loyalty program | tenant P2 |
| 14 | `14_platform_team.sql` | platform_member + assignment | platform PP1 |
| 15 | `15_platform_finance.sql` | platform_expense | platform PP1 |
| 16 | `16_tracking_event_log.sql` | event tracking | [[vault/10-Features/agent-team-sync]] |
| 17 | `17_audit_log.sql` | audit log | agent-team |
| 18 | `18_order_notify.sql` | order notifications | agent-team |
| 19 | `19_order_assignee.sql` | order assignee | agent-team |
| 20 | `20_abandoned_carts.sql` | abandoned-cart automation | agent-team |
| 21 | `21_shipping.sql` | shipping_config + shipping_zone_rate (M3 calculator) | [[10-Features/shipping]] · applied to prod 2026-06-26 |

> ✅ **16–20 applied to prod 2026-06-26.** They had NEVER run on prod (ledger stopped at 15;
> `tracking_event_log`/`order_note`/`cart` were missing → those features were dead on prod).
> Applied the fixed/idempotent versions. `audit_log` was also migrated **old→new schema**:
> 01_schema shipped a stale `bigint`/`text`/`created_at` design that diverged from migration 17 +
> `lib/audit/record.ts` (`uuid`/`audit_action`/`occurred_at`); the empty old table was dropped and
> recreated. Fix committed `8a23229`; idempotent guards added to 16/17 so re-application is safe.
