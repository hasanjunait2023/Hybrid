---
type: feature
status: wip
panel: [admin, platform, storefront]
area: i18n
migrations: []
commit: ""
owner: ""
created: 2026-06-26
---

# i18n — localize server-action error strings

## What
Server actions (`actions.ts`, `*-actions.ts`) still return **Bengali** error strings. They were
out of scope for the main i18n sweep (which covered view files). The user-facing forms fall back
to localized dict strings, but specific validation errors from actions stay Bengali in EN mode.

## Why
Last gap to "a-to-z English-default". Each action should read the locale and return localized text.

## Scope
- [ ] Backend (each action: `getLocale()` + return localized error)
- [x] Frontend (forms already fall back to dict strings)
- [ ] DB migration — none
- [ ] Tests

## Approach
Add a small `actionError(locale, key)` helper or have actions return an error `code` and let the
client map it via the dict (cleaner — keeps actions locale-free). Decide, then sweep `actions.ts`.

## Links
[[vault/10-Features/i18n-bilingual]] · [[vault/20-Decisions/0005-i18n-english-default]] · [[vault/50-Knowledge/i18n-glossary]]
