---
type: note
---

# Dev-brain runbook (NotebookLM ⟷ vault)

The second-brain loop: NotebookLM does continuous web research; results land in
[[vault/60-Research/_index|60-Research]] as linked notes. Engine lives in
`scripts/dev-brain/` (full manual: `scripts/dev-brain/README.md`).

## The loop
1. Topics queue in [[vault/60-Research/_backlog|the backlog]] (`- [ ] slug :: query :: mode`).
2. `research-sync.sh` (daily via Task Scheduler) runs each open topic:
   NotebookLM web research → synthesis framed for Hybrid → markdown note.
3. Note written to `60-Research/<date>-<slug>.md`; backlog flipped to `[x]`;
   day logged in [[vault/70-Daily/2026-06-26|today's daily]].
4. Backlink the note into the relevant [[vault/10-Features/_backlog|feature]] or
   [[vault/20-Decisions/_index|decision]] — that's what makes it compound.

## Scheduled tasks (Windows)
| Task | Cadence | Does |
|------|---------|------|
| `HybridDevBrain-Research` | daily 09:00 | runs the backlog |
| `HybridDevBrain-AuthKeepalive` | every 20 min | refreshes NotebookLM cookies |

Manage: `Get-ScheduledTask -TaskName 'HybridDevBrain-*'`. Install/remove via
`scripts/dev-brain/install-cron.ps1`.

## Operating
- **Add research**: append a line to the backlog. No other step.
- **Run now**: `bash scripts/dev-brain/research-sync.sh` (optionally `--limit 1`).
- **Ask the brain live (from Claude)**: the `notebooklm` MCP is registered — query it directly.
- **Auth dead?** symptom: run log says `auth invalid`. Fix: `notebooklm login`.

## Guardrails
- No secrets in research notes (vault rule 1). Synthesis + pointers only.
- Deep research is slow (15-30 min/topic) and burns NotebookLM quota — keep the
  backlog intentional, not a firehose.
