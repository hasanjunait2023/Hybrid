#!/usr/bin/env bash
# Hybrid prod deploy — self-healing. Canonical secrets live OUTSIDE the source
# tree at /root/hybrid.env so a source resync / accidental rm cannot lose them;
# we restore .env.deploy from there around every compose step (it has been
# deleted mid-build on this shared box). Build-gated: a failed build keeps the
# old container running. Run on the VPS: `bash /opt/hybrid/deploy.sh`.
set -uo pipefail
cd /opt/hybrid || exit 9
ENV_SRC=/root/hybrid.env
STUDIO=supabase-studio-pe9o2li2n3bns3wnofob49uw
META=supabase-meta-pe9o2li2n3bns3wnofob49uw
restore_env() { cp -f "$ENV_SRC" /opt/hybrid/.env.deploy && chmod 600 /opt/hybrid/.env.deploy; }
COMPOSE() { docker compose --env-file /opt/hybrid/.env.deploy -f /opt/hybrid/docker-compose.prod.yml "$@"; }

# Pull latest if this is a git checkout (fast-forward only; never resets).
if [ -d /opt/hybrid/.git ]; then
  git -C /opt/hybrid fetch origin master 2>/dev/null \
    && git -C /opt/hybrid pull --ff-only origin master 2>/dev/null \
    || echo "[deploy] git pull skipped (local changes / no auth) — using working tree"
fi

# Pre-deploy smoke test — blocks deploys if any invariant is broken.
# This is the safety net for the 2026-07-01 P0 login outage: it catches
# hardcoded env values, missing SUPABASE_* keys, network attach regressions,
# and missing hardening source files BEFORE we ship.
if [[ -f /opt/hybrid/scripts/hybrid-predeploy-check.sh ]]; then
  bash /opt/hybrid/scripts/hybrid-predeploy-check.sh || {
    echo "[deploy] pre-deploy smoke test FAILED — refusing to deploy. Fix issues and retry."
    docker unpause "$STUDIO" "$META" 2>/dev/null || true
    exit 2
  }
fi

docker pause "$STUDIO" "$META" 2>/dev/null || true
restore_env
COMPOSE build web || { echo "[deploy] build FAILED — keeping old container"; docker unpause "$STUDIO" "$META" 2>/dev/null || true; exit 1; }
restore_env
COMPOSE up -d --force-recreate web
docker unpause "$STUDIO" "$META" 2>/dev/null || true
restore_env
echo "[deploy] done — $(docker ps --format '{{.Names}} {{.Status}}' | grep hybrid-web)"
