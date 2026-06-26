---
type: glossary
area: i18n
---

# EN ↔ BN i18n glossary

Canonical Bangla term per English string so every agent + the dictionaries stay consistent.
Source of truth for values: `apps/web/lib/i18n/dictionaries/{en,bn}/`. Keep this in sync when
adding dict keys.

| English | বাংলা | notes |
|---|---|---|
| Product | পণ্য | |
| Order | অর্ডার | |
| Customer | গ্রাহক | |
| Cash on Delivery (COD) | ক্যাশ অন ডেলিভারি | never abbreviate in BN |
| Delivery | ডেলিভারি | |
| Courier | কুরিয়ার | |
| Payment | পেমেন্ট | |
| bKash | বিকাশ | |
| Discount | ডিসকাউন্ট | |
| Return / RTO | রিটার্ন / RTO | |
| Settings | সেটিংস | |
| Dashboard | ড্যাশবোর্ড | |
| Save | সংরক্ষণ | |
| Cancel | বাতিল | |
| Delete | মুছুন | |
| Search | খুঁজুন | |
| Total | মোট / সর্বমোট | "সর্বমোট" = grand total |
| Pending | অপেক্ষমাণ | fulfillment status |
| Confirmed | নিশ্চিত | |
| Delivered | ডেলিভার্ড | |

## Rules
- **Numerals follow locale**: EN → Latin (`1,899`), BN → Bangla (`১,৮৯৯`) via `formatMoney`/`formatNumber`.
- Admin/platform are operator-facing; storefront is customer-facing — same glossary, both bilingual.
- Brand/technical tokens stay as-is: `Hybrid`, `SKU`, `bKash`(EN), `API key`, PEM, etc.

Related: [[vault/20-Decisions/0005-i18n-english-default]] · [[vault/10-Features/i18n-bilingual]]
