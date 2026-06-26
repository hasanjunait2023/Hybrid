---
type: adr
status: accepted
date: 2026-06-26
---

# 0005 — English-default UI with Bangla toggle

**Status:** accepted

## Context
App was Bengali-first hardcoded (969 strings inline, no i18n layer). Needed a system-wide
language switch with English as the default.

## Decision
Cookie-backed (`hybrid_lang`) bilingual layer, English default. Locale flows server-side via
`getDict()`, client-side via `LocaleProvider`/`useDict()`. Both dictionaries bundled; only the
2-letter locale crosses the server→client boundary. Digits localize via `formatMoney`/`formatNumber`.

## Consequences
- Storefront stays visually Bengali-capable but defaults English (founder choice, overrides the
  original "Bengali-first storefront" stance).
- `@hybrid/ui` shared components take a `lang` prop (can't import the app dict).
- Server-action error strings still Bengali — open item ([[vault/10-Features/_backlog]]).

## Links
[[vault/10-Features/i18n-bilingual]] · [[vault/50-Knowledge/i18n-glossary]]
