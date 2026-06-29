#!/usr/bin/env bash
# Lightweight VPS clone sync — keep /opt/hybrid current with origin on every
# push (any branch), WITHOUT a rebuild. fetch only updates remote-tracking refs
# (always safe). ff-only pull advances the checked-out branch ONLY when no local
# edit would be overwritten — the box carries uncommitted prod hotfixes, so a
# conflicting pull is deliberately SKIPPED (refs still updated), never clobbered.
# Run on the VPS via the forced-command sync SSH key (see .github/workflows/sync-vps.yml).
set -uo pipefail
cd /opt/hybrid || exit 9
BR=$(git rev-parse --abbrev-ref HEAD)
git fetch --all --prune
if git pull --ff-only origin "$BR" 2>/dev/null; then
  s="pulled"
else
  s="fetch-only (local edits/diverged — refs updated, working tree preserved)"
fi
echo "[sync] $s -> $BR @ $(git rev-parse --short HEAD) (origin/$BR $(git rev-parse --short "origin/$BR" 2>/dev/null))"
