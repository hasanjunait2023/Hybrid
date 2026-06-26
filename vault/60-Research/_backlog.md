---
type: note
---

# Research backlog (cron queue)

The dev-brain loop reads this file. One topic per line. Format (machine-parsed — keep it exact):

```
- [ ] <slug> :: <research query> :: <mode>
```

- `<slug>` — kebab-case filename stem (no spaces). Becomes `60-Research/<date>-<slug>.md`.
- `<query>` — the question NotebookLM researches (web sources).
- `<mode>` — `deep` (20+ sources, 15-30 min) or `fast` (5-10 sources, seconds).

Checked `- [x]` lines are done and skipped. The cron flips `[ ]`→`[x]` after a note lands.

> Pipeline: [[vault/30-Ops/dev-brain-runbook|dev-brain runbook]]. Engine: `scripts/dev-brain/`.

## Stack research seed (Phase 1/2 foundations)
- [x] supabase-rls-multitenant :: Postgres RLS patterns and pitfalls for multi-tenant SaaS at scale — session GUCs, performance, BYPASSRLS roles, policy testing :: deep
- [ ] nextjs15-caching :: Next.js 15 App Router caching — unstable_cache, revalidateTag, multi-instance cache handlers, ISR on self-hosted deployments :: deep
- [ ] bkash-tokenized-checkout :: bKash Tokenized Checkout integration — grant/create/execute/query lifecycle, amount verification, replay protection, production onboarding :: deep
- [ ] steadfast-courier-api :: Steadfast courier API for Bangladesh — consignment creation, status polling, COD reconciliation, RTO handling :: deep
- [ ] self-hosted-supabase-ops :: Self-hosted Supabase on a small VPS — GoTrue auth, MinIO storage, Kong gateway, running lean on 8GB, backup/restore :: deep

## Open / ad-hoc
<!-- add new topics here -->
