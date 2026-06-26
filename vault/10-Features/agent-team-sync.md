---
type: feature
status: done
panel: [admin, storefront]
area: infra
migrations: [16, 17, 18, 19, 20]
commit: 705239e
owner: agent-team
created: 2026-06-26
---

# Agent-team feature batch (PWA, SEO, analytics, …)

## What
Work done by parallel agents **directly on the VPS** (`/opt/hybrid`, not git), pulled
down and committed `705239e` (93 files).

## Includes
- **PWA**: `sw.js`, `offline/`, `manifest.ts`, `ServiceWorkerRegister`
- **SEO**: `sitemap.ts`, `robots.ts`, `lib/seo`
- analytics (Meta CAPI), audit log, cookie consent, `auth/oauth`
- loyalty, marketing automation (abandoned-cart), job queue, sms queue
- payments reconcile, order notes + assignee, dashboard widgets, mobile views
- i18n: cookie-consent namespace + `useT` helper

## DB
Migrations 16–20 — see [[vault/30-Ops/migration-ledger]].

## ⚠️ Lesson
This work lived **only on the VPS** and was nearly lost. Now logged in
[[vault/30-Ops/git-vps-sync]]. Every agent session must record where its work lands.

## Follow-up
- [[vault/10-Features/security-oauth-fix]] — 2 HIGH vulns found in the oauth code on review.
