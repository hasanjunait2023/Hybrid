---
type: feature
status: blocked
panel: [admin, platform]
area: auth
migrations: []
commit: 7207f1d
owner: claude-opus
created: 2026-06-26
tags: [risk/security]
---

# Deploy oauth security fix to VPS

## What
The oauth account-takeover + open-redirect fix ([[vault/10-Features/security-oauth-fix]], commit
`7207f1d`) is in git but **not durably on the VPS**.

## Status: blocked
The fix IS live in the running container (image rebuilt with it), but the **VPS source keeps
getting reverted** — `oauth.ts` was rolled back to Jun-25, and `.env.deploy`/`deploy.sh` were
deleted (recovered `.env.deploy` from the live container → `/root/.env.deploy.recovered`).
Another agent / process on the shared VPS overwrites `/opt/hybrid`. A clean redeploy will keep
reverting until that's stopped.

## Blocker / next
- [ ] Stop agents from overwriting `/opt/hybrid` (esp. deleting `.env.deploy`).
- [ ] Convert `/opt/hybrid` to a git checkout (deploy via `git pull`) — see [[vault/30-Ops/git-vps-sync]].
- [ ] Then rebuild from clean source so source == the fixed running build.

## Links
[[vault/30-Ops/git-vps-sync]] · [[vault/30-Ops/deploy-runbook]]
