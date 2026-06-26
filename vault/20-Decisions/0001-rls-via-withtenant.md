---
type: adr
status: accepted
date: 2026-01-01
---

# 0001 — RLS via withTenant() is the only tenant data path

**Status:** accepted

## Context
Multi-tenant DB; a single raw query as superuser leaks every tenant's data cross-tenant.

## Decision
All tenant data goes through `withTenant(tenantId, userId, tx => …)` as `app_runtime_login`
(non-superuser, RLS forced via `app.current_tenant_id` GUC). Never the raw `sql` client, never
the Supabase client for tenant data. Platform/cross-tenant data uses `asPlatformAdmin` (BYPASSRLS).

## Consequences
- Enforced by the **`no-raw-sql` ESLint rule** (build-breaking).
- Two-role split: `app_runtime_login` (LOGIN) + `app_runtime` (NOLOGIN group, grants).
- Migrations/seed use `DIRECT_URL` (`postgres`, BYPASSRLS).

## Links
[[CLAUDE]] "The Golden Rule" · [[.claude/team/DECISIONS]]
