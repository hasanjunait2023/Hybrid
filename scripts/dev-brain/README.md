# dev-brain — NotebookLM → Obsidian research loop

Turns Google NotebookLM into a continuous research engine that feeds the Obsidian
vault (`vault/`) as a second brain for Hybrid. Web research lands as linked,
synthesized markdown notes; the loop runs daily on Windows Task Scheduler.

```
backlog (vault/60-Research/_backlog.md)
        │  one topic per line
        ▼
research-sync.sh ──► NotebookLM: add-research (web) ──► ask (synthesize for Hybrid)
        │
        ├──► vault/60-Research/<date>-<slug>.md   (type: research, backlinked)
        ├──► flips backlog item  [ ] → [x]
        └──► appends vault/70-Daily/<today>.md
```

## Files
| File | Role |
|------|------|
| `config.sh` | shared paths, notebook name, doc-source list, auth check. No secrets. |
| `seed-notebook.sh` | one-time: create the notebook + load project docs. Idempotent. |
| `research-sync.sh` | the loop: backlog → research → vault note. Locked single-instance. |
| `install-cron.ps1` | registers the daily task + a 20-min auth keepalive. |
| `.notebook-id` | saved notebook id (created by seed). gitignored. |
| `.logs/` | per-day run logs. gitignored. |

## Setup (run once, in order)
```bash
# 1. Authenticate NotebookLM (opens browser; only you can do this)
notebooklm login
notebooklm auth check --test --json     # expect "status": "ok"

# 2. Create + seed the notebook with project docs
bash scripts/dev-brain/seed-notebook.sh

# 3. First research run (uses the seeded stack backlog; deep mode = slow, 15-30 min/topic)
bash scripts/dev-brain/research-sync.sh --limit 1     # test with one topic first

# 4. Install the daily scheduled loop + auth keepalive
powershell -ExecutionPolicy Bypass -File scripts\dev-brain\install-cron.ps1 -At "09:00"
```

## Daily use
- Add a topic: append to `vault/60-Research/_backlog.md`:
  `- [ ] my-slug :: the research question :: deep`
- The next cron run (or `bash scripts/dev-brain/research-sync.sh`) picks it up.
- Read results in Obsidian under **60-Research** (or the [[vault/60-Research/_index]] dataview).

## Live queries from Claude
The `notebooklm` MCP server is registered (user scope). In any Claude session you can
ask the brain directly, e.g. *"ask the notebooklm brain what we decided about RLS"* —
no script needed for read queries.

## Uninstall the loop
```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-brain\install-cron.ps1 -Uninstall
```

## Notes / gotchas
- **Auth is per-machine** (cookies in `~/.notebooklm`). The keepalive task refreshes them;
  if a run logs `auth invalid`, run `notebooklm login` again.
- **Rate limits**: `ask` (used for synthesis) is reliable; heavy artifact generation
  (audio/video/quiz) is not — this loop deliberately avoids them.
- **No secrets in the vault** — notes are synthesis + pointers, same rule as the rest of `vault/`.
