# billing-sweep

বিলিং স্টেট মেশিন ম্যানুয়ালি রান করো — trialing → past_due → suspended ট্রানজিশন।

## ব্যবহার

```
/billing-sweep
```

## কীভাবে কাজ করে

`apps/web/lib/billing/sweep.ts` → `evaluateTenantBilling()` ফাংশন প্রতিটি টেন্যান্টের জন্য:

```
trialing  →  (trial_ends_at < NOW())  →  past_due
past_due  →  (grace period শেষ)      →  suspended
active    →  (payment failed)         →  past_due
```

## API Endpoint দিয়ে রান

```bash
curl -X POST https://hybrid.ecomex.cloud/api/internal/billing-sweep \
  -H "Authorization: Bearer $CRON_SECRET"
```

`CRON_SECRET` env ভেরিয়েবল থেকে নিতে হবে।

## Local/Dev রান

```bash
# এই কমান্ড sweep.ts কে ডিরেক্টলি কল করে
pnpm --filter web tsx apps/web/lib/billing/sweep.ts
```

## কী চেক করবে

1. `CRON_SECRET` সেট আছে কিনা নিশ্চিত করো
2. Sweep endpoint-এ POST করো
3. Response দেখো — কতটি টেন্যান্টের স্ট্যাটাস বদলালো রিপোর্ট করো
4. Suspended টেন্যান্টদের storefront `store-not-found` দেখাচ্ছে কিনা ভেরিফাই করো

## Cron Schedule

Production-এ GitHub Actions Cron দিয়ে প্রতিদিন মধ্যরাতে রান হয় (`.github/workflows/ci.yml` চেক করো)।

## সতর্কতা

`asPlatformAdmin()` দিয়ে রান হয় — RLS bypass। শুধু billing state বদলায়, কোনো টেন্যান্ট ডেটা রিড/রাইট করে না।
