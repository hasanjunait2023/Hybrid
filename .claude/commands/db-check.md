# db-check

Database RLS isolation ও সব টেস্ট রান করো।

## Full Test Suite (63 tests)

```bash
pnpm --filter @hybrid/db test
```

এই কমান্ড embedded-postgres বুট করে, সব SQL মাইগ্রেশন অ্যাপ্লাই করে, এবং নিচের টেস্ট ফাইলগুলো রান করে:

| ফাইল | টেস্ট | কী চেক করে |
|---|---|---|
| `rls.test.ts` | 5 | RLS tenant isolation (সবচেয়ে গুরুত্বপূর্ণ) |
| `crypto.test.ts` | 8 | AES-256-GCM credential sealing |
| `commerce.test.ts` | - | Inventory decrement, oversell guard |
| `checkout.test.ts` | - | COD + bKash checkout idempotency |
| `payment-verify.test.ts` | - | bKash amount verification |
| `provision.test.ts` | - | Tenant provisioning, slug uniqueness |
| `resolve.test.ts` | - | Tenant liveness (trial/suspended) |
| `admin.test.ts` | - | Low-stock, order cancel guard |
| `billing.test.ts` | - | Billing state machine |
| `courier-wire.test.ts` | - | Consignment + status sync |

## শুধু RLS গেট চেক

```bash
pnpm --filter @hybrid/db test rls
```

## TypeScript Type Regenerate (schema পরিবর্তনের পর)

```bash
pnpm db:gen
```

`DIRECT_URL` (postgres superuser) দিয়ে চলে। রান করার পর `packages/db/src/types.ts` কমিট করো।

## সব 63 টেস্ট পাস হলেই কাজ সম্পন্ন — একটাও ফেল হলে ফিক্স না করে PR মার্জ করা যাবে না।
