# tenant-reactivate

একটি suspended টেন্যান্টকে reactivate করো (platform admin only)।

## ব্যবহার

```
/tenant-reactivate <tenant-slug>
```

যেমন: `/tenant-reactivate store-a`

## Steps

1. **slug নিশ্চিত করো।**

2. **বর্তমান স্ট্যাটাস চেক করো** — `/tenant-status <slug>` রান করো।

3. **Reactivate করো** (`asPlatformAdmin` দিয়ে):
   ```sql
   UPDATE tenant SET status = 'active' WHERE slug = '<slug>';
   UPDATE subscription
   SET billing_state = 'active', current_period_end = NOW() + INTERVAL '30 days'
   WHERE tenant_id = (SELECT id FROM tenant WHERE slug = '<slug>');
   ```

4. **Redis cache invalidate করো** — নতুন active স্ট্যাটাস যাতে ক্যাশে ধরে।

5. **ভেরিফাই করো:**
   - `https://<slug>.hybrid.ecomex.cloud` → storefront লোড হচ্ছে কিনা
   - Products ও products ঠিকঠাক দেখাচ্ছে কিনা

## Platform UI থেকেও করা যায়

`app.hybrid.ecomex.cloud/platform` → টেন্যান্ট খোঁজো → "Reactivate" বাটন।
