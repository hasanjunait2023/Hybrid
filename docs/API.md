# API — surface map

Hybrid's mutation surface is **mostly Next.js Server Actions** (per feature), not REST endpoints.
HTTP route handlers exist only for callbacks, auth, internal cron, and uploads. This file maps
both. Generated from the tree — keep in sync when you add routes/actions.

---

## HTTP route handlers (`apps/web/app/api/`)

| Route | Method(s) | Purpose | Guard |
|---|---|---|---|
| `/api/auth/login` | POST | Verify creds (GoTrue or password branch) → mint `hybrid_session` | rate-limited |
| `/api/auth/signup` | POST | Provision tenant + create GoTrue user (email-confirmed) | rate-limited |
| `/api/auth/logout` | POST | Clear session | session |
| `/api/auth/otp/request` | POST | Request OTP (phone/email flow) | rate-limited |
| `/api/bkash/callback` | GET/POST | bKash server-side execute + amount verify + replay guard | signature/replay guard |
| `/api/admin/upload` | POST | Image upload (mime/size/filename sanitized) → BlobStore | admin session |
| `/api/internal/billing-sweep` | POST | Billing state-machine runner (trialing→past_due→suspended) | `CRON_SECRET` |
| `/api/internal/courier-sync` | POST | Poll Steadfast status, update orders | `CRON_SECRET` |
| `/api/internal/tls-allow` | POST | Custom-domain TLS allow-list hook | `CRON_SECRET` |

All tenant data inside handlers goes through `withTenant()` / `asPlatformAdmin()`.

---

## Server Actions (mutations, `"use server"`)

### Storefront
- `_sites/[tenant]/checkout/actions.ts` — place order (COD + bKash), location pickers.

### Marketing
- `signup/actions.ts` — `provisionTenant()` new-tenant signup.

### Admin (tenant)
| Area | File |
|---|---|
| Products | `admin/products/actions.ts`, `admin/products/import/actions.ts` |
| Orders | `admin/orders/actions.ts`, `bulk-actions.ts`, `[id]/courier-actions.ts`, `[id]/payment-actions.ts` |
| Customers | `admin/customers/actions.ts`, `customers/blacklist/actions.ts` |
| Discounts | `admin/discounts/actions.ts` |
| Returns | `admin/returns/actions.ts` |
| Reviews | `admin/reviews/actions.ts` |
| Marketing | `admin/marketing/actions.ts` |
| COD | `admin/cod/settlements/settlement-actions.ts` |
| Themes | `admin/themes/actions.ts` |
| Settings | `settings/{store,payments,courier,analytics,loyalty,notifications,domains,staff,test-connection}/actions.ts` |

### Platform (super-admin)
| Area | File |
|---|---|
| Tenant directory | `platform/actions.ts` (suspend/reactivate/impersonate) |
| Billing | `platform/billing/actions.ts` |
| Finance | `platform/finance/actions.ts` |
| Plans | `platform/plans/actions.ts` |
| Team | `platform/team/actions.ts` |

---

## FastAPI (`apps/api/`)
Heavy async jobs (courier sync, reconciliation). See `apps/api/README.md` + `apps/api/app/`.

---

## Conventions
- After any tenant mutation, call `revalidateTag(...)` per the cache-tag scheme in `CLAUDE.md`.
- Auth-gated route segments: `export const dynamic = "force-dynamic"`.
- Validate all input at the boundary; user-facing errors friendly + Bengali.

> Regenerate the lists:
> ```bash
> find apps/web/app/api -name route.ts        # HTTP handlers
> grep -rl '"use server"' apps/web/app         # server actions
> ```
