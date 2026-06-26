---
type: ops
updated: 2026-06-26
---

# Git ⟷ VPS sync board

> [!warning] The core risk
> `/opt/hybrid` on the VPS is a **plain source tree, NOT git**. Agents (and deploys) edit it
> directly. Work there is **one `rm` from gone** until pulled down + committed. This board tracks
> divergence so nothing is lost again.

## How they relate
- **GitHub** `origin/master` = source of truth → https://github.com/hasanjunait2023/Hybrid
- **VPS** `/opt/hybrid` = what's deployed/running, edited by agents directly.
- They drift. Pull VPS → local, diff vs HEAD, commit, then they match.

## Sync procedure (VPS → git)
```bash
# 1. download (tar only on stdout — no echo pollution!)
ssh mt5vps 'cd /opt/hybrid && tar czf - --exclude=node_modules --exclude=.next \
  --exclude=dist --exclude=.turbo --exclude=.git apps packages 2>/dev/null' > /tmp/vps.tgz
# 2. extract over local repo, then: git status / diff vs HEAD
# 3. pnpm install (new deps), tsc, secret-scan, commit, push
```

## Deploy procedure (git/local → VPS)
```bash
# tar push apps+packages → /opt/hybrid, then rebuild web
docker compose --env-file .env.deploy -f docker-compose.prod.yml build web
docker compose --env-file .env.deploy -f docker-compose.prod.yml up -d --force-recreate web
# pause supabase-studio + supabase-meta during build (8GB box). Caddy re-resolves web automatically.
```

## Current state (update each sync)
| date | direction | commit | notes |
|---|---|---|---|
| 2026-06-26 | VPS → git | `705239e` | agent-team batch (PWA/SEO/analytics/loyalty/…) 93 files |
| 2026-06-26 | git only | `7207f1d` | oauth security fix — ⚠️ NOT yet pushed to VPS |

## Hardened (2026-06-26) — the recurring incident is contained
`/opt/hybrid` is on a **shared VPS** where another agent kept overwriting the tree, reverting
`oauth.ts`, and deleting `.env.deploy`/`deploy.sh`. Durable fixes applied:

- **Secrets moved OUT of the deletable tree** → canonical at `/root/hybrid.env` (20 keys). A source
  resync / `rm` can no longer lose them. Backup also at `/root/.env.deploy.recovered`.
- **`/root/hybrid-env-guard.sh` cron** (every minute) restores `/opt/hybrid/.env.deploy` from
  `/root/hybrid.env` if it goes missing. `.env.deploy` deletion no longer breaks deploys.
- **`/opt/hybrid/deploy.sh`** rewritten self-healing: restores `.env.deploy` around every compose
  step, pauses studio/meta, build-gated (keeps old container if build fails). Best-effort
  `git pull --ff-only` (won't reset).
- **`/opt/hybrid` is now a git repo** (baseline `13a18a3`). Reverts/deletions are now visible via
  `git -C /opt/hybrid status` and recoverable via `git checkout 13a18a3 -- <path>`.
- **Read-only deploy key** on GitHub (`hybrid-vps-deploy`) → VPS can `git fetch` the private repo
  (SSH remote). Verified.

## Open
- [ ] **VPS tree ↔ GitHub full alignment**: they diverged (484 files; VPS has runtime/extra files,
  lacks `vault/`). A blind `reset --hard origin/master` is unsafe with active agents — reconcile
  deliberately (diff `13a18a3` vs `origin/master`, decide per file) before switching to pure
  pull-deploy.
- [ ] **Stop the other agent from overwriting `/opt/hybrid`** at the source — the root cause. Until
  then, the guards above contain the damage.
- [x] Secrets durability · [x] `.env.deploy` self-heal · [x] git version-control · [x] deploy key
