---
type: feature
status: blocked
panel: [admin]
area: sms
migrations: []
commit: ""
owner: ""
created: 2026-06-26
---

# Customer communication log (SMS + email)

## What
Customer-detail page has a `CommunicationLog` UI + a `getCustomerDetail().communications`
read — but the underlying `sms_log` / `email_log` tables **don't exist** and **nothing writes
them**. The agent-team shipped the read + UI without the schema or the write path.

## Status: blocked / half-built
- `lib/admin/customers.ts` was querying phantom `sms_log`/`email_log` → crashed `getCustomerDetail`
  (db test failure). **Fixed** by returning `[]` (UI shows empty), with a TODO at the call site.

## To actually build it
- [ ] Migration: `sms_log` + `email_log` (tenant-scoped, RLS, `customer_id`, `template_key`,
  `status`, `sent_at`).
- [ ] Write path: log on send in `lib/sms/notify.ts` (+ whatever sends email — none exists yet).
- [ ] Restore the union query in `customers.ts` (`select … from sms_log … union all … email_log`).

## Links
`apps/web/lib/admin/customers.ts` (comms-log TODO) · `apps/web/app/(admin)/admin/customers/[id]/page.tsx` (CommunicationLog)
