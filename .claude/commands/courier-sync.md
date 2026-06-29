# courier-sync

Steadfast থেকে কুরিয়ার স্ট্যাটাস পোল করে অর্ডার আপডেট করো।

## ব্যবহার

```
/courier-sync
```

অথবা নির্দিষ্ট টেন্যান্টের জন্য:
```
/courier-sync <tenant-slug>
```

## কীভাবে কাজ করে

`apps/web/lib/couriers/sync.ts` → `courierSync()`:

1. `sent_to_courier` স্ট্যাটাসের সব অর্ডার খোঁজে
2. Steadfast API-তে consignment ID দিয়ে স্ট্যাটাস পোল করে
3. Internal status map করে:
   - `In Transit` → `in_transit`
   - `Delivered` → `delivered`
   - `Cancelled` → `cancelled`
4. অর্ডার টেবিল আপডেট করে

## API Endpoint দিয়ে রান

```bash
curl -X POST https://hybrid.ecomex.cloud/api/internal/courier-sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

## কী চেক করবে

1. Steadfast credentials কনফিগার আছে কিনা (settings → courier)
2. Sync endpoint রান করো
3. কতটি অর্ডার আপডেট হলো রিপোর্ট করো
4. কোনো `delivered` অর্ডার COD collection-এ চলে গেছে কিনা চেক করো

## Status Map (statusMap.ts)

| Steadfast Status | Internal Status |
|---|---|
| `In Review` | `sent_to_courier` |
| `In Transit` | `in_transit` |
| `Delivered` | `delivered` |
| `Cancelled` | `cancelled` |
| `Partial Delivered` | `partial_delivered` |
| `Unknown` | `unknown` |

## Cron Schedule

Production-এ প্রতি ঘন্টায় রান হয়। ম্যানুয়াল রান শুধু দরকার হয় যদি কোনো অর্ডার stuck থাকে।

## Steadfast Live ক্রেডেনশিয়াল

`admin.hybrid.ecomex.cloud/admin/settings` → Courier Settings-এ API Key ও Secret সেভ করো। এগুলো `APP_ENCRYPTION_KEY` দিয়ে encrypted থাকে।
