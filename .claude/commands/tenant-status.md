# tenant-status

কোনো টেন্যান্টের বর্তমান স্ট্যাটাস, সাবস্ক্রিপশন, এবং বিলিং অবস্থা চেক করো।

## ব্যবহার

```
/tenant-status <tenant-slug>
```

যেমন: `/tenant-status store-a`

## Steps

1. **args থেকে tenant slug নাও।** slug না দেওয়া হলে জিজ্ঞেস করো।

2. **GitHub MCP বা DB দিয়ে টেন্যান্ট খোঁজো:**
   ```sql
   -- asPlatformAdmin দিয়ে রান করো
   SELECT
     t.id, t.slug, t.custom_domain, t.status,
     s.plan_id, s.status as sub_status,
     s.trial_ends_at, s.current_period_end,
     s.billing_state
   FROM tenant t
   LEFT JOIN subscription s ON s.tenant_id = t.id
   WHERE t.slug = '<slug>';
   ```

3. **স্ট্যাটাস রিপোর্ট করো:**

   | ফিল্ড | অর্থ |
   |---|---|
   | `tenant.status` | `active` / `suspended` |
   | `subscription.billing_state` | `trialing` / `active` / `past_due` / `suspended` |
   | `trial_ends_at` | ট্রায়াল কখন শেষ হবে |
   | `current_period_end` | বর্তমান বিলিং পিরিয়ড শেষ |

4. **Storefront লাইভ কিনা চেক করো:**
   - `https://<slug>.hybrid.ecomex.cloud` রেসপন্ড করছে কিনা দেখো
   - Suspended হলে "store not found" দেখাবে

5. **সাম্প্রতিক অর্ডার কাউন্ট:**
   ```sql
   -- withTenant(tenantId) দিয়ে রান করো
   SELECT COUNT(*) FROM "order" WHERE created_at > NOW() - INTERVAL '7 days';
   ```

## দ্রুত অ্যাকশন

- **Suspend করতে:** `/tenant-suspend <slug>` (platform admin only)
- **Reactivate করতে:** `/tenant-reactivate <slug>` (platform admin only)
- **Impersonate করতে:** `app.hybrid.ecomex.cloud/platform` → Impersonate বাটন
