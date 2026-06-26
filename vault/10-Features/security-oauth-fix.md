---
type: feature
status: done
panel: [admin, platform]
area: auth
migrations: []
commit: 7207f1d
owner: claude-opus
created: 2026-06-26
tags: [risk/security]
---

# Fix — OAuth account-takeover + open redirect

## What
Two HIGH vulns (auto-review) in the agent-team `oauth` code.

1. **Account takeover** — `mintSessionFromSupabase` ignored `createAppUser`'s upsert-on-email
   takeover guard. OAuth login with a victim's email merged into their **password account** →
   session minted. Fix: require provider-verified email + refuse merge into any password account.
2. **Open redirect** — `/auth/callback?next=` accepted absolute / `//` URLs. Fix: same-origin
   local paths only.

## Status
Fixed local + GitHub (`7207f1d`). ⚠️ **Not yet on VPS** — prod runs the vulnerable version
until redeploy (gated behind OAuth being credential-enabled, so low live exposure).

## Links
- `apps/web/lib/auth/oauth.ts`, `apps/web/app/auth/callback/route.ts`
- [[vault/30-Ops/git-vps-sync]]
