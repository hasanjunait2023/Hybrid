# Hybrid vault

Obsidian command center, layered over the repo. **Vault root = repo root** — open
`d:\BD shopify` in Obsidian. Notes are version-controlled with the code.

## Structure
- `10-Features/` — one note per feature. Frontmatter drives the [[PROJECT]] dashboards.
- `20-Decisions/` — atomic ADRs (architecture decision records).
- `30-Ops/` — deploy runbook, migration ledger, git⟷VPS sync board.
- `40-Agents/` — agent worklog (antidote to work living only on the VPS).
- `50-Knowledge/` — BD commerce domain + EN↔BN i18n glossary.
- `60-Research/` — NotebookLM-fed research notes (dev-brain loop). See [[vault/30-Ops/dev-brain-runbook|runbook]].
- `70-Daily/` — daily dev log.
- `90-Templates/` — Templater templates for the above.

## Rules
1. **No secrets.** Pointers only ("password in GoTrue/Studio").
2. **Don't duplicate code.** Link to `path:line`; link to canonical `docs/*`.
3. **Every agent session** adds a line to the day's [[vault/40-Agents/_index|worklog]] — what files, committed or VPS-only.

## Recommended plugins
Dataview, Templater, Obsidian Git, Kanban, Excalidraw, Tag Wrangler.
Set Templater template folder → `vault/90-Templates`. Set Obsidian Git to auto-pull on
load + commit on a timer (markdown only).

## Tags
`#status/idea #status/wip #status/done #status/blocked` ·
`#panel/admin #panel/platform #panel/storefront #panel/marketing` ·
`#area/i18n #area/auth #area/payments #area/courier #area/infra` ·
`#risk/security`
