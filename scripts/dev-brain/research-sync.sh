#!/usr/bin/env bash
# The dev-brain loop. Reads the vault research backlog, runs each open topic
# through NotebookLM (web research -> synthesis), lands a linked markdown note
# in vault/60-Research/, flips the backlog item to done, and logs the day.
#
# Prereq: notebooklm login  +  seed-notebook.sh has run once.
# Usage:  bash scripts/dev-brain/research-sync.sh [--limit N]
# Cron:   invoked daily by install-cron.ps1 (Windows Task Scheduler).

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/config.sh"

LIMIT=0
[ "${1:-}" = "--limit" ] && LIMIT="${2:-0}"

# --- single-instance lock (stale after 2h) ---------------------------------
if [ -d "$LOCK_FILE" ]; then
  if [ -n "$(find "$LOCK_FILE" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    rmdir "$LOCK_FILE" 2>/dev/null || true
  else
    log "another sync is running ($LOCK_FILE); exit"; exit 0
  fi
fi
mkdir "$LOCK_FILE" 2>/dev/null || { log "could not acquire lock; exit"; exit 0; }
trap 'rmdir "$LOCK_FILE" 2>/dev/null || true' EXIT

exec >> "$LOG_DIR/sync-$(date +%Y%m%d).log" 2>&1
log "=== research-sync start ==="

require_auth
NB="$(notebook_id)"
if [ -z "$NB" ]; then
  log "ERROR: no notebook id. Run seed-notebook.sh first."; exit 1
fi

# --- collect open backlog items: "- [ ] slug :: query :: mode" --------------
mapfile -t OPEN < <(grep -nE '^- \[ \] .+ :: .+ :: .+' "$BACKLOG" || true)
if [ "${#OPEN[@]}" -eq 0 ]; then
  log "backlog empty; nothing to research"; exit 0
fi

today="$(date +%Y-%m-%d)"
daily="$DAILY_DIR/$today.md"
done_count=0

attempts=0
for entry in "${OPEN[@]}"; do
  [ "$LIMIT" -gt 0 ] && [ "$attempts" -ge "$LIMIT" ] && break
  body="${entry#*:}"                       # strip "lineno:"
  payload="${body#- \[ \] }"               # strip checkbox
  slug="$(printf '%s' "$payload"  | awk -F ' :: ' '{print $1}' | tr -d '[:space:]')"
  query="$(printf '%s' "$payload" | awk -F ' :: ' '{print $2}')"
  mode="$(printf '%s' "$payload"  | awk -F ' :: ' '{print $3}' | tr -d '[:space:]')"
  [ -z "$slug" ] || [ -z "$query" ] && { log "skip malformed: $payload"; continue; }
  case "$slug$query" in *"<"*|*">"*) log "skip placeholder/example: $slug"; continue;; esac
  mode="${mode:-deep}"
  attempts=$((attempts + 1))

  log "research: $slug (mode=$mode)"
  # 1) ephemeral per-topic notebook. Keeps the main docs notebook ($NB) clean for
  #    live MCP queries and prevents cross-topic source pollution.
  rnb="$(notebooklm create "research-$slug-$today" --json 2>/dev/null | jq -r '.notebook.id // empty')"
  if [ -z "$rnb" ]; then log "WARN: could not create research notebook for $slug"; continue; fi
  log "  notebook=$rnb"

  # 2) web research into the topic notebook. --cited-only keeps it to the sources
  #    NotebookLM actually used (~10-20), not every hit (100+). add-research exits
  #    non-zero on the import-retry phase even when imports succeeded — so we
  #    tolerate it and verify by counting imported sources instead.
  notebooklm source add-research "$query" --mode "$mode" --import-all --cited-only \
    --timeout 2400 -n "$rnb" --json >/dev/null 2>&1 \
    || log "  note: add-research returned non-zero; verifying imports"
  srccount="$(notebooklm source list -n "$rnb" --json 2>/dev/null | jq -r '.count // 0')"
  if [ "$srccount" -eq 0 ]; then
    log "WARN: 0 sources imported for $slug; deleting empty notebook, leaving in backlog"
    notebooklm delete -n "$rnb" --yes >/dev/null 2>&1 || true
    continue
  fi
  log "  imported $srccount source(s)"

  # 3) synthesize, framed for Hybrid. `ask` is the reliable path.
  prompt="Synthesize the key findings for: $query. Focus on what is actionable for Hybrid, a Bengali-first multi-tenant commerce SaaS on Next.js + self-hosted Supabase (RLS), bKash/COD payments, and Bangladesh couriers. Give concrete recommendations and cite sources."
  answer="$(notebooklm ask "$prompt" -n "$rnb" --json 2>/dev/null | jq -r '.answer // empty')"
  if [ -z "$answer" ]; then
    log "WARN: empty synthesis for $slug; leaving in backlog (notebook $rnb kept)"
    continue
  fi

  note="$RESEARCH_DIR/$today-$slug.md"
  title="$(printf '%s' "$slug" | tr '-' ' ')"
  {
    printf -- '---\n'
    printf 'type: research\n'
    printf 'topic: "%s"\n' "$query"
    printf 'mode: %s\n' "$mode"
    printf 'notebook: %s\n' "$rnb"
    printf 'sources: %s\n' "$srccount"
    printf 'status: synthesized\n'
    printf 'created: %s\n' "$today"
    printf 'tags: [research/auto]\n'
    printf -- '---\n\n'
    printf '# %s\n\n' "$title"
    printf '> Auto-synthesized by the dev-brain loop on %s from NotebookLM notebook `%s`.\n\n' "$today" "$rnb"
    printf '%s\n\n' "$answer"
    printf -- '## Applies to Hybrid\n- Code: `apps/web/...` / `packages/...`\n- Decision: [[ ]]\n- Feature: [[ ]]\n\n'
    printf -- '## Sources\nNotebookLM (`research-%s-%s`): `notebooklm source list -n %s`\n' "$slug" "$today" "$rnb"
  } > "$note"
  log "  wrote: $note"

  # 4) flip backlog item to done
  esc_slug="$(printf '%s' "$slug" | sed 's/[][\.*^$/]/\\&/g')"
  sed -i "s/^- \[ \] ${esc_slug} ::/- [x] ${esc_slug} ::/" "$BACKLOG"

  # 5) daily log line
  [ -f "$daily" ] || printf -- '---\ntype: daily\ndate: %s\n---\n\n# %s\n\n## Done\n' "$today" "$today" "$today" > "$daily"
  printf -- '- research synced: [[vault/60-Research/%s-%s|%s]]\n' "$today" "$slug" "$title" >> "$daily"

  done_count=$((done_count + 1))
done

log "=== done: $done_count topic(s) synced ==="
