---
type: note
---

# Feature backlog / open items

- [ ] **i18n: localize server-action error strings** — `actions.ts` files still return Bengali
  error text; each action should read locale + return localized. `#area/i18n`
- [ ] **Deploy oauth security fix to VPS** — `7207f1d` is in git, not on prod. `#risk/security`
  See [[vault/10-Features/security-oauth-fix]].
- [ ] **Reconcile VPS ⟷ git ongoing** — agents work on VPS; keep [[vault/30-Ops/git-vps-sync]] current.

> New idea? `Cmd-N` → apply the [[vault/90-Templates/feature]] template.
