---
type: adr
status: accepted
date: 2026-06-25
supersedes: "Phase 2 drops Supabase"
---

# 0003 — Self-hosted Supabase on the VPS

**Status:** accepted (reverses the earlier "Phase 2 drops Supabase" plan)

## Context
Need DB + auth + storage on one box (`hybrid.ecomex.cloud`, 2 vCPU / 8 GB). Vercel + Supabase
Cloud + Upstash was the old plan; cost + control pushed to self-hosting.

## Decision
Entire backend on a self-hosted Supabase stack (Docker) on the VPS:
- **DB** → `supabase-db` (Postgres 15), Hybrid schema in `postgres.public`.
- **Auth** → GoTrue ([[vault/20-Decisions/0004-auth-provider-supabase|ADR-0004]]).
- **Storage** → MinIO (`BLOB_DRIVER=s3`, `cdn.hybrid.ecomex.cloud`).
- Reverse proxy **Caddy** (`hybrid-caddy`), app `hybrid-web`, cache `hybrid-redis`.

## Consequences
- Stack trimmed (dropped analytics/logflare, vector, realtime, edge-functions, supavisor) to fit 8 GB.
- Do **not** reintroduce Vercel/Upstash/Supabase-Cloud assumptions.
- `/opt/hybrid` is a plain source tree (NOT git) → see [[vault/30-Ops/git-vps-sync]] risk.

## Links
[[docs/INFRA_SUPABASE|Infra runbook]] · [[CHANGELOG]] 2026-06-25
