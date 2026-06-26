#!/usr/bin/env bash
# One-time bootstrap: create the "Hybrid — Dev Brain" NotebookLM notebook and
# load it with the project's grounding docs. Idempotent — re-running reuses the
# saved notebook id and only adds docs that aren't there yet.
#
# Prereq: notebooklm login  (auth must be live)
# Usage:  bash scripts/dev-brain/seed-notebook.sh

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/config.sh"

require_auth

NB="$(notebook_id)"
if [ -z "$NB" ]; then
  log "Creating notebook: $NOTEBOOK_NAME"
  NB="$(notebooklm create "$NOTEBOOK_NAME" --json | jq -r '.notebook.id')"
  if [ -z "$NB" ] || [ "$NB" = "null" ]; then
    log "ERROR: notebook creation failed"; exit 1
  fi
  printf '%s\n' "$NB" > "$NOTEBOOK_ID_FILE"
  log "Created notebook id=$NB (saved to .notebook-id)"
else
  log "Reusing notebook id=$NB"
fi

# Existing source titles, to skip re-adding.
existing="$(notebooklm source list -n "$NB" --json 2>/dev/null | jq -r '.sources[].title' || true)"

added=0
for rel in "${DOC_SOURCES[@]}"; do
  path="$REPO/$rel"
  if [ ! -f "$path" ]; then
    log "WARN: missing doc, skipping: $rel"
    continue
  fi
  base="$(basename "$rel")"
  case "$existing" in
    *"$base"*) log "skip (already a source): $rel"; continue;;
  esac
  log "adding source: $rel"
  if notebooklm source add "$path" -n "$NB" --json >/dev/null 2>&1; then
    added=$((added + 1))
  else
    log "WARN: failed to add $rel (continuing)"
  fi
done

log "Done. Added $added new doc source(s) to '$NOTEBOOK_NAME'."
log "Sources index: notebooklm source list -n $NB"
log "Next: bash scripts/dev-brain/research-sync.sh   (runs the backlog)"
