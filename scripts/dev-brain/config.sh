#!/usr/bin/env bash
# Shared config for the dev-brain (NotebookLM -> Obsidian vault) pipeline.
# Sourced by seed-notebook.sh and research-sync.sh. No secrets here.

set -euo pipefail

# Repo root = two levels up from this script (scripts/dev-brain/ -> repo).
DEV_BRAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DEV_BRAIN_DIR/../.." && pwd)"

NOTEBOOK_NAME="Hybrid — Dev Brain"
VAULT="$REPO/vault"
RESEARCH_DIR="$VAULT/60-Research"
BACKLOG="$RESEARCH_DIR/_backlog.md"
DAILY_DIR="$VAULT/70-Daily"
LOG_DIR="$DEV_BRAIN_DIR/.logs"
NOTEBOOK_ID_FILE="$DEV_BRAIN_DIR/.notebook-id"
LOCK_FILE="$DEV_BRAIN_DIR/.sync.lock"

mkdir -p "$LOG_DIR"

# Project docs to seed NotebookLM with (the "grounding" sources).
# Paths relative to repo root; missing files are skipped with a warning.
DOC_SOURCES=(
  "CLAUDE.md"
  "docs/PRD.md"
  "docs/BUILD_CHECKLIST.md"
  "docs/DESIGN.md"
  "docs/INFRA_SUPABASE.md"
  "docs/architecture/phase0-blueprint.md"
  "docs/architecture/phase1-blueprint.md"
  "docs/research/phase0-brief.md"
  "docs/research/phase1-brief.md"
)

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

require_auth() {
  if ! notebooklm auth check --test --json 2>/dev/null | grep -q '"status": "ok"'; then
    log "ERROR: NotebookLM auth invalid/expired. Run: notebooklm login"
    exit 1
  fi
}

notebook_id() {
  [ -f "$NOTEBOOK_ID_FILE" ] && tr -d '[:space:]' < "$NOTEBOOK_ID_FILE" || true
}
