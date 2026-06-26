---
type: knowledge
---

# BD commerce domain

Domain notes for Bangladesh e-commerce — the "why" behind product decisions. Stub; grow as needed.

## Payments
- **bKash** — dominant mobile wallet. Tokenized Checkout (grant→create→execute→query).
  Production credentials = ~2–4 week merchant onboarding.
- **Nagad**, **SSLCommerz**, **COD** — COD is the default + trust anchor (pay-on-delivery).

## Couriers
- **Steadfast** (Phase 1; no sandbox — live after merchant account), **Pathao**, **RedX**, **Paperfly**.
- RTO (return-to-origin) is a real cost; returns/fraud tracking matters.

## SMS
- `sms.net.bd`. Sender-ID masking approval ~6–7 days. Order notifications in Bengali.

## Trust signals (storefront)
- COD-green badge always visible. Bangla numerals customer-facing. Mobile-first (one-thumb).

Canonical specs: [[docs/PRD|PRD]] · [[docs/research/phase1-brief|research briefs]].
