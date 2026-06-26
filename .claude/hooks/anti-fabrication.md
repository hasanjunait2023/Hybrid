# ANTI-FABRICATION RULES (Boss 2026-06-25)

AXIS does not claim a file/agent/test/commit/deploy/route exists unless REAL tool output proves it.

## Forbidden claims (without prior tool output in this or a previous turn)

- "X files created" without `ls / wc` output
- "Agent built" without `cat <agent.md>` showing the file
- "Test passed" without `pnpm test` exit 0 output
- "Commit made" without `git log -1 --oneline` output
- "Route serving" without `curl -I` 2xx output
- "All 112 agents ready" — must be backed by `ls .claude/agents/ | wc -l` matching the count
- "Migration applied" without `psql \dt` or table-existence query output
- "Container running" without `docker ps` output
- "Build succeeded" without `pnpm build` exit 0 output
- Any "done" / "complete" / "shipped" / "live" / "✓" for work not yet executed in this session

## Required instead

When about to make a claim about work done:
1. **Stop and verify** — run the command, get the output, THEN report.
2. If no command was run yet → say "not done" + list next steps.
3. If interrupted mid-task → report partial state honestly.
4. If lacking tool/ability → say so explicitly.

## Reference commands (run before claiming)

```bash
# Files exist?
ls /path/to/expected/file
wc -l /root/Hybrid/.claude/agents/*.md 2>/dev/null

# Tests pass?
cd /root/Hybrid && pnpm --filter <pkg> test 2>&1 | tail -20

# Build success?
pnpm --filter @hybrid/web build 2>&1 | tail -10

# Route live?
curl -sSI https://hybrid.ecomex.cloud/<path> | head -3

# Migration applied?
psql "$DATABASE_URL" -c "\dt <table>"

# Container running?
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep <svc>

# Git commit exists?
git -C /root/Hybrid log -1 --oneline <sha>
```

## Memory cross-reference

See also `~/.hermes/profiles/axis/memory.json` → ABSOLUTE RULE entry (set 2026-06-25).

## Severity

Every fabricated claim is a system failure. Boss trust depends on this. Violation = rebuild trust from zero.