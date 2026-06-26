# Agent worklog

Parallel agents work this repo (and historically, the VPS directly). **Every session logs one
row** so nothing is silently lost. New day → [[vault/90-Templates/agent-worklog|template]].

```dataview
LIST
FROM "vault/40-Agents"
WHERE type = "agent-log"
SORT file.name DESC
```

Rule: if work lands **VPS-only**, mark it and add it to [[vault/30-Ops/git-vps-sync]].
