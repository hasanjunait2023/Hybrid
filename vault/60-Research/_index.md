---
type: note
---

# Research (NotebookLM-fed)

Auto-synthesized research notes. Each note is a NotebookLM report downloaded into the
vault by the dev-brain loop, then backlinked into features/decisions/knowledge.

- Source engine: NotebookLM notebook **Hybrid — Dev Brain** (`notebook` id in each note's frontmatter).
- Queue: [[vault/60-Research/_backlog|research backlog]] — add a topic, the cron picks it up.
- Pipeline + runbook: [[vault/30-Ops/dev-brain-runbook|dev-brain runbook]].

```dataview
TABLE topic, mode, status, created
FROM "vault/60-Research"
WHERE type = "research"
SORT created DESC
```

New manual research → [[vault/90-Templates/research|research template]].
