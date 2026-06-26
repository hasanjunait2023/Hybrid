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

## Open
- [ ] Deploy `7207f1d` (oauth fix) to VPS.
- [ ] Decide: should agents commit to git instead of editing VPS directly? (recommended)
