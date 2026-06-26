---
type: home
updated: 2026-06-26
---

# 🧭 Hybrid — Command Center

Bengali-first, mobile-first multi-tenant commerce SaaS ("Shopify for Bangladesh").
This is the human-facing map over the repo + the agent fleet. Open the repo root as the
Obsidian vault. Code stays code; this layer is for navigation, decisions, and coordination.

> [!tip] How to read this
> Frontmatter on each note powers the Dataview tables below. Add a note, fill its
> `status`/`panel`/`area`, and it shows up here automatically.

## 🔗 Canonical docs (source of truth, don't duplicate)
- [[CLAUDE]] — agent context (LOCKED stack, golden rule, repo map)
- [[docs/PRD|PRD]] · [[docs/ARCHITECTURE|Architecture]] · [[docs/DESIGN|Design]]
- [[docs/INFRA_SUPABASE|Infra runbook]] · [[docs/DEPLOY|Deploy]] · [[docs/ENV|Env]]
- [[.claude/team/DECISIONS|Full decisions log (46KB)]] — atomic ADRs live in [[vault/20-Decisions/_index|20-Decisions]]
- [[CHANGELOG]]

## 🚦 Active work
```dataview
TABLE status, panel, area, commit
FROM "vault/10-Features"
WHERE type = "feature" AND status != "done"
SORT status ASC
```

## ✅ Shipped features
```dataview
TABLE panel, area, commit
FROM "vault/10-Features"
WHERE type = "feature" AND status = "done"
SORT file.name ASC
```

## 🧱 Decisions (ADRs)
```dataview
TABLE status, date
FROM "vault/20-Decisions"
WHERE type = "adr"
SORT file.name ASC
```

## 🛠 Ops
- [[vault/30-Ops/git-vps-sync|Git ⟷ VPS sync board]] — what's committed vs only-on-VPS ⚠️
- [[vault/30-Ops/migration-ledger|DB migration ledger]]
- [[vault/30-Ops/deploy-runbook|Deploy runbook]]

## 🤖 Agents
- [[vault/40-Agents/_index|Agent worklog]] — every session logs what it touched + committed-or-VPS-only

## 📚 Knowledge
- [[vault/50-Knowledge/i18n-glossary|EN↔BN i18n glossary]]
- [[vault/50-Knowledge/bd-commerce|BD commerce domain (couriers, bKash, COD, SMS)]]

## 🌐 Live URLs
| Surface | URL |
|---|---|
| Super-admin | https://app.hybrid.ecomex.cloud |
| Tenant admin | https://admin.hybrid.ecomex.cloud |
| Storefront | https://{slug}.hybrid.ecomex.cloud |
| Marketing | https://hybrid.ecomex.cloud |
| CDN | https://cdn.hybrid.ecomex.cloud |

> [!warning] No secrets here. This vault is in git. Credentials live in GoTrue/Studio + `.env.deploy` (VPS only). Notes hold pointers, never values.
