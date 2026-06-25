# OUTPUT FORMAT — how Claude responds on this repo

## Code
- **Full file** when creating new files. For edits to existing files, use surgical diffs
  (the Edit tool) — do not reprint whole unchanged files.
- Always include the file path (the Edit/Write tools already carry it; in prose use
  clickable `[name](path)` links).
- Match existing style in the file. Don't reformat untouched lines.
- TypeScript strict — no `any` escapes, no `@ts-ignore` without a reason comment.

## Tenant data
- Every tenant query through `withTenant()`. Never raw `sql` / Supabase client for tenant data.
- Migrations/seed/platform-admin only via `DIRECT_URL` / `asPlatformAdmin`.

## Language
- Response prose: Bengali + English technical terms (mixed, as the founder writes).
- **Code, identifiers, commit messages, PRs: English.**
- User-facing UI strings: Bengali-first (storefront customer-facing = Bangla digits;
  admin operator-facing = Latin digits).

## Completion
- A task is done only when its verification step passes (see `.claude/hooks/completion-gate.md`).
- State plainly what was verified and what was skipped. No "should work" hedging.
- If tests fail, show the output. If a step was skipped, say so.

## Changes
- Every changed line traces to the request. No drive-by refactors of adjacent code.
- Remove only orphans your own change created. Flag pre-existing dead code, don't delete it.

## Anti-stub
- No `TODO`, `FIXME`, `pass`, `...`, `placeholder`, or "rest is left to you" in shipping code.
  See `.claude/hooks/anti-stub.md`.
