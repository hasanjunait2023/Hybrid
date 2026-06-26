---
type: feature
status: done
panel: [admin, platform, storefront, marketing]
area: i18n
migrations: []
commit: 0648b99
owner: claude-opus
created: 2026-06-26
---

# i18n — English-default + Bangla toggle

## What
App-wide bilingual layer. English is the system default; users flip to Bangla via a
cookie-backed toggle (`hybrid_lang`).

## How
- `apps/web/lib/i18n/` — config, `formatMoney`/`formatNumber` (locale digits), namespace-split
  dictionaries (`en`/`bn`), server `getDict()`, client `LocaleProvider`/`useDict()`, `LanguageToggle`.
- `StatusBadge` default flipped to EN, `lang` threaded everywhere.
- Storefront `@hybrid/ui` components take a `lang` prop (inline bilingual, like StatusBadge).
- Root `<html lang>` follows the cookie.

## Status
All 4 panels + auth done. tsc 0, eslint 0, 207/207 db tests. Live on prod.
Commits `060eb18 → 0648b99`.

## Open
- Server-action error strings still Bengali (see [[vault/10-Features/_backlog]]).

## Links
- Glossary: [[vault/50-Knowledge/i18n-glossary]]
- Code: `apps/web/lib/i18n/`
