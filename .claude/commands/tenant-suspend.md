# tenant-suspend

একটি টেন্যান্টকে suspend করো (platform admin only)।

## ব্যবহার

```
/tenant-suspend <tenant-slug>
```

যেমন: `/tenant-suspend store-a`

## সতর্কতা

**এই অ্যাকশন টেন্যান্টের storefront অবিলম্বে বন্ধ করে দেবে।** রান করার আগে কনফার্ম করো।

## Steps

1. **slug নিশ্চিত করো** — জিজ্ঞেস করো কোন slug suspend করতে হবে।

2. **কারণ জিজ্ঞেস করো** — payment issue / policy violation / request?

3. **বর্তমান স্ট্যাটাস চেক করো** — `/tenant-status <slug>` রান করো।

4. **Suspend করো** (`asPlatformAdmin` দিয়ে):
   ```sql
   UPDATE tenant SET status = 'suspended' WHERE slug = '<slug>';
   UPDATE subscription SET billing_state = 'suspended' WHERE tenant_id = (
     SELECT id FROM tenant WHERE slug = '<slug>'
   );
   ```

5. **Redis cache invalidate করো:**
   - `invalidateDomainCache(tenantId)` কল হবে স্বয়ংক্রিয়ভাবে platform data layer থেকে
   - অথবা: `apps/web/lib/platform/cache.ts` → `invalidateDomainCache()`

6. **ভেরিফাই করো:**
   - `https://<slug>.hybrid.ecomex.cloud` → "store not found" দেখাচ্ছে কিনা

## Reactivate করতে

`/tenant-reactivate <slug>`
