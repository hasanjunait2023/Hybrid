---
type: process
area: architecture
updated: 2026-06-26
---

# How we use graphify (machine map) + this vault (human map)

Two maps, opposite directions. **graphify** auto-derives *how the code is wired* (reality,
bottom-up). **This vault** records *what we decided and what's next* (intent, top-down). The
power is the loop between them.

| | graphify | vault |
|---|---|---|
| answers | "what is true about the code?" | "what did we decide / what's left?" |
| nature | derived, **regenerable**, objective | authored, **durable**, opinionated |
| owns | dependencies, god nodes, communities, impact | ADRs, feature status, worklog, drift board |

## The loop
```
PLAN   (vault: ADR + feature note)      → intent
MAP    (/graphify: structure + impact)  → reality
BUILD  (agents, partitioned by communities)
VERIFY (/graphify re-run: coupling? new god nodes? drift gone?)
LOG    (vault: worklog + status + git-vps-sync)
```

## When to run `/graphify`
- After a big merge (e.g. the 93-file agent-team sync).
- Before any refactor (get the blast radius first).
- To diff **local repo vs VPS `/opt/hybrid`** → structural drift (pairs with [[vault/30-Ops/git-vps-sync]]).
- Weekly. It's cheap + disposable.

## 6 ways it helps build Hybrid
1. **Onboarding** — god nodes = learn-these-first keystones (`withTenant`, `StatusBadge`, i18n dict, `session.ts`). Communities = the real modules.
2. **Impact analysis** — callers/callees/BFS before touching a hub; write the blast radius into the feature note Scope.
3. **Agent partitioning** — communities = clean file-ownership seams; **never split a god node across parallel agents** (this is what caused our i18n dict-file contention).
4. **Drift detection** — graph the local repo + the VPS tree, diff → exactly what diverged.
5. **Architecture audit** — community detection surfaces bad coupling (client importing server-only, cross-tenant reach, dict bleeding into payments).
6. **Decision grounding** — confirm reality before an ADR ("does anything still import the raw `sql` client?" → validates the no-raw-sql rule).

## Repo wiring
- `graphify-out/` is **gitignored** (regenerable; don't bloat git with the HTML).
- Graph-derived MOC lives here in `15-Architecture/` and is **linked, never hand-copied** (auto-structure goes stale instantly).

## Anti-patterns
- Don't maintain graphify HTML as docs — regenerate.
- Don't duplicate the dependency graph into notes by hand.
- Don't split parallel agents across a god node.
- No secrets in either.

Related: [[vault/15-Architecture/_moc|Architecture MOC (graph-derived)]] · [[PROJECT]]
