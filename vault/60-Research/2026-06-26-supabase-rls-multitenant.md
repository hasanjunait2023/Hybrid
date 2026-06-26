---
type: research
topic: "Postgres RLS patterns and pitfalls for multi-tenant SaaS at scale — session GUCs, performance, BYPASSRLS roles, policy testing"
mode: deep
notebook: 269a7ef8-121b-4d67-910d-cc265943cc08
sources: 83
status: synthesized
created: 2026-06-26
tags: [research/auto]
---

# supabase rls multitenant

> Auto-synthesized by the dev-brain loop on 2026-06-26 from NotebookLM notebook `269a7ef8-121b-4d67-910d-cc265943cc08`.

For **Hybrid**, a Bengali-first multi-tenant commerce SaaS built on Next.js and self-hosted Supabase, the **shared schema with a `tenant_id` column** is the recommended architecture [1, 2]. It balances cost-efficiency with logical isolation by leveraging PostgreSQL Row-Level Security (RLS) [1-3]. 

However, scaling RLS safely across thousands of merchants introduces severe pitfalls regarding connection pooling, query optimization, and silent security bypasses. Here are the key findings and concrete recommendations for Hybrid's architecture.

### 1. Handling Tenant Context & Connection Pooling (Session GUCs)
Supabase (and Next.js serverless functions) relies heavily on connection poolers like PgBouncer or Supavisor running in **transaction pooling mode** to handle high-throughput traffic [4, 5].
*   **The Pitfall:** Standard `SET SESSION` variables leak across connections. When a transaction ends, the pooled connection retains the session state. If not cleared, the next tenant picking up that connection will silently inherit the previous tenant's identity, causing catastrophic cross-tenant data leaks [6, 7].
*   **Actionable Recommendation:** Always pass the tenant identity (e.g., from your Next.js JWT) into a strictly **transaction-scoped** Grand Unified Configuration (GUC) parameter. Use `set_config('app.current_tenant_id', tenant_id, true)`, where the `true` flag scopes the variable strictly to the local transaction lifecycle [8-10].
*   **Implementation:** Read the variable in your RLS policies using `current_setting('app.current_tenant_id', true)`. The `true` parameter (for `missing_ok`) ensures the database returns a safe `NULL` instead of throwing an error if the context is missing, allowing RLS to fail-closed and return zero rows [11-14].

### 2. Performance Optimization & Index Strategies
RLS can silently turn indexed queries into full sequential table scans if not optimized correctly [15-17].
*   **The Pitfall (LEAKPROOF operators):** PostgreSQL evaluates RLS policies *before* standard query filters to prevent malicious users from bypassing security via side-channels [17]. If your RLS policy uses functions that are not explicitly marked as `LEAKPROOF` (e.g., complex text matching or unoptimized custom enum checks), the query planner will refuse to use your indexes [16, 18, 19].
*   **Actionable Recommendation:** Wrap RLS logic in `STABLE LEAKPROOF` functions so PostgreSQL can cache them across the query and safely push down index scans [20-22].
*   **The Pitfall (Read vs. Delete Paradox):** Standard composite indexes like `(tenant_id, order_id)` optimize READs but destroy `ON DELETE CASCADE` performance (e.g., deleting a merchant cascade-deleting their bKash payment logs). This is because foreign key constraint checks bypass RLS and look up the child table using only the `order_id` [23, 24].
*   **Actionable Recommendation:** Use **Composite Primary Keys with Organization ID Priority**: `PRIMARY KEY (tenant_id, id)` [25, 26]. This guarantees Index Only Scans for standard reads while preserving lightning-fast Cascade Delete performance for operations like purging merchant records [27, 28].

### 3. Policy Architecture & Preventing Bypass (`BYPASSRLS`)
RLS is designed to be a defense-in-depth mechanism, but default PostgreSQL behaviors can easily override it [15, 29].
*   **The Pitfall (Superusers and Owners):** The `postgres` role, table owners, and any role with the `BYPASSRLS` attribute ignore RLS entirely [29-31]. If your Next.js app connects using the table owner role, RLS will silently do nothing [29, 31]. 
*   **Actionable Recommendation:** Ensure your application connects via a least-privilege role (like Supabase's `authenticated` or `anon` roles) [30, 32]. Furthermore, execute `ALTER TABLE your_table FORCE ROW LEVEL SECURITY;` on all tables (Orders, Payments, Courier Logs) so policies apply even to the table owner [31, 32].
*   **Actionable Recommendation (Views):** If you use database views for reporting (e.g., a dashboard of COD vs. bKash performance), append `WITH (security_invoker = true)` to the view. Otherwise, views execute with the creator's permissions and completely bypass RLS [33-35].
*   **Actionable Recommendation (Denormalization):** Avoid subqueries in your RLS policies (e.g., checking a user's role in a separate `users` table), as this causes nested "policy compounding" that executes for every row [36]. Always denormalize the `tenant_id` onto every child table (e.g., `bkash_transactions`, `steadfast_courier_logs`) so the policy remains a simple flat check [22]. 

### 4. Policy Testing and Silent Failures
Testing RLS requires a shift in mindset: **RLS failures are silent.** An unauthorized query doesn't throw an error; it simply returns 0 rows [37-39].
*   **The Pitfall:** Relying on manual testing leaves you vulnerable. A missing policy `WITH CHECK` clause (which governs `INSERT`/`UPDATE`) might allow a user to insert rows they are subsequently forbidden to read [14, 40].
*   **Actionable Recommendation:** Treat RLS policies as critical infrastructure by unit testing them in your CI/CD pipeline using **pgTAP** [41, 42]. Use Supabase's `database.dev` test helpers (like `tests.authenticate_as()`) to fake JWT contexts and simulate tenant access [43, 44]. 
*   **Actionable Recommendation:** Consider utilizing automated reverse-predicate seeding tools like **rlsautotest**, which auto-generates pgTAP tests for every identity (owner, external tenant, anon) to mathematically prove your boundaries are leak-proof without writing thousands of lines of boilerplate [45, 46]. Always ensure tests are wrapped in `BEGIN` and `ROLLBACK` blocks to maintain database state isolation [37, 41, 47].

## Applies to Hybrid
- Code: `apps/web/...` / `packages/...`
- Decision: [[ ]]
- Feature: [[ ]]

## Sources
NotebookLM (`research-supabase-rls-multitenant-2026-06-26`): `notebooklm source list -n 269a7ef8-121b-4d67-910d-cc265943cc08`
