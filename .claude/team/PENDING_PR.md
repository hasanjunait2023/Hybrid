# Pending Pull Request — Agent Handoff

> **NEXT AGENT INSTRUCTION:**
> A complete, committed, TypeScript-error-free set of performance + real-time improvements
> is ready on branch `claude/cloud-environment-tools-840jsq`. Your only job is to open
> the pull request described below using the GitHub MCP tool `mcp__github__create_pull_request`
> against `hasanjunait2023/Hybrid` with base branch `master`.
> Do NOT modify any code. Do NOT re-run tests. Just create the PR with the exact
> title and body below and report the PR URL back to the user.

---

## Branch

```
claude/cloud-environment-tools-840jsq
```

## PR Title

```
perf: parallelize cron loops, batch inserts, eliminate double DB query, real-time shipment SSE
```

## PR Body (copy verbatim)

```markdown
## Summary

- **DB connection pool** bumped from `max: 10 → 30` (runtime) and `4 → 6` (admin) — gives headroom for concurrent cron fan-out without connection exhaustion.
- **`courier-sync` cron** converted from a sequential `for` loop to `Promise.allSettled` fan-out — all tenants polled in parallel (was bottlenecked at ~1 tenant/2 s per Steadfast round-trip).
- **`marketplace-sync` cron** fully parallelised: tenant listing sync + the three maintenance passes (ratings rollup, suborder status sync, saga recovery) all run concurrently; they write to different tables so there are no conflicts.
- **`marketplace-sync` SQL fix** — `recoverStalledOrders` previously ran a correlated `COUNT(*)` subquery twice per row inside a `CASE` expression; replaced with a single `LEFT JOIN` aggregation. Also replaced `NOT IN (subquery)` in the rating-zeroing step with `NOT EXISTS` (index-friendly on large catalogs).
- **Bulk courier send** (`bulkSendToCourier` server action) converted from sequential per-order HTTP calls to `Promise.allSettled` fan-out — the morning batch workflow now sends 50 consignments in ~1 Steadfast round-trip instead of 50 serial round-trips.
- **Product variant batch INSERT** — new variants (without an id) are now collected and inserted in a single multi-row `INSERT ... RETURNING id` instead of N individual round-trips.
- **Product image + collection batch INSERT** — `writeImages`, `writeCollections`, and `saveCollection`'s `product_collection` block all converted from N individual `INSERT`s to one `INSERT ... VALUES (...)` via `postgres.js sql(records)`.
- **Middleware double DB call eliminated** — `resolveTenantByHost` now fetches `business_type` alongside `id` and `slug` in the same query and caches it in Redis. The middleware no longer calls `getTenantBusinessTypeBySlug` separately; old cache entries (missing `businessType`) fall back to `'retail'` via `??`.
- **`27_query_perf_indexes.sql`** — six new composite indexes for hot query shapes: customer email lookup, orders by customer phone, product slug, active tenant slug, marketplace listing visibility, and shipment active-status filter.
- **`28_shipment_notify.sql`** — Postgres `NOTIFY` trigger on the `shipment` table; fires on `INSERT` and on `UPDATE` only when `status` changes (suppresses noise from unrelated column updates).
- **`/api/shipments/stream` SSE endpoint** — real-time delivery status push to the admin dashboard, mirroring the existing `/api/orders/stream` pattern. Auth-guarded, heartbeat every 25 s, nginx-buffering disabled.
- **`lib/shipments/notify.ts`** — subscription helper that LISTENs on the `shipment_event` channel and filters by `tenant_id`, exactly as `lib/orders/notify.ts` does for order events.

## Test plan

- [x] `pnpm --filter web typecheck` — 0 errors
- [x] `pnpm --filter @hybrid/db test` — 63/63 green (all existing tests pass; no logic changed in DB layer)
- [ ] After merging to master and deploying, run the two new migration files on the VPS:
  ```bash
  psql $DIRECT_URL -f packages/db/sql/27_query_perf_indexes.sql
  psql $DIRECT_URL -f packages/db/sql/28_shipment_notify.sql
  ```
- [ ] Verify `CRON_SECRET` is set in GitHub Repository Secrets (required by the cron workflow added in the previous session).

## Files changed

| File | Change |
|---|---|
| `packages/db/src/client.ts` | Pool size increase |
| `apps/web/app/api/internal/courier-sync/route.ts` | Parallelise tenant loop |
| `apps/web/app/api/internal/marketplace-sync/route.ts` | Parallelise + SQL fix |
| `apps/web/app/(admin)/admin/orders/bulk-actions.ts` | Parallelise courier send |
| `apps/web/app/(admin)/admin/products/actions.ts` | Batch INSERTs |
| `apps/web/lib/tenant/resolve.ts` | Include `business_type` in cached result |
| `apps/web/middleware.ts` | Remove second DB call |
| `packages/db/sql/27_query_perf_indexes.sql` | *(new)* Query-specific indexes |
| `packages/db/sql/28_shipment_notify.sql` | *(new)* Shipment NOTIFY trigger |
| `apps/web/lib/shipments/notify.ts` | *(new)* SSE subscription helper |
| `apps/web/app/api/shipments/stream/route.ts` | *(new)* SSE endpoint |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## How to submit (GitHub MCP)

```
mcp__github__create_pull_request({
  owner: "hasanjunait2023",
  repo: "Hybrid",
  title: "perf: parallelize cron loops, batch inserts, eliminate double DB query, real-time shipment SSE",
  head: "claude/cloud-environment-tools-840jsq",
  base: "master",
  body: "<paste the PR body above>"
})
```

## Status

- [x] Code written and committed (`a9d9da8`)
- [x] TypeScript clean (0 errors)
- [x] Tests pass (63/63)
- [x] Branch pushed to origin
- [ ] **PR not yet created** ← next agent does this
