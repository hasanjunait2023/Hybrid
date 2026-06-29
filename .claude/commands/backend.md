# backend

Hybrid প্রজেক্টের জন্য Backend Engineering — withTenant RLS, Server Actions, API Routes, Auth, Payments, Couriers, Storage, Cache।

## ব্যবহার

```
/backend <task-description>
```

যেমন:
- `/backend add discount code feature to checkout`
- `/backend implement Pathao courier adapter`
- `/backend add webhook endpoint for bKash payment`
- `/backend create product variant pricing logic`

---

## PHASE 1 — THE GOLDEN RULE (এটা ভুললে সব শেষ)

### RLS — Tenant Isolation

```ts
// ✅ CORRECT — সব tenant data এভাবে
import { withTenant } from "@hybrid/db";

const products = await withTenant(tenantId, userId, (tx) =>
  tx`SELECT * FROM product WHERE active = true`
);

// ✅ Platform admin (cross-tenant, CRON, billing sweep)
import { asPlatformAdmin } from "@hybrid/db";

const tenants = await asPlatformAdmin((tx) =>
  tx`SELECT * FROM tenant WHERE status = 'active'`
);

// ❌ FORBIDDEN — RLS bypass, build-breaking ESLint error
import { sql } from "@hybrid/db/client";
import postgres from "postgres";
const data = await sql`SELECT * FROM product`; // leaks ALL tenants' data
```

### Why it matters

`withTenant()` → connects as `app_runtime_login` → sets `app.current_tenant_id` GUC → RLS filters rows per-tenant.
`sql` / `adminSql` → connects as `postgres` (BYPASSRLS) → sees ALL tenants' data → catastrophic cross-tenant leak.

---

## PHASE 2 — Database Layer

### 2.1 Schema Files (lexical order — এই ক্রমে apply হয়)

```
packages/db/sql/
├── 00_roles.sql         app_runtime_login LOGIN role
├── 01_schema.sql        Tables, indexes, constraints — canonical source of truth
├── 02_policies.sql      RLS policies — canonical source of truth
├── 03_seed.sql          Dev seed only (2 tenants, 6 products, 4 plans)
├── 04_grant_login.sql   GRANT app_runtime TO app_runtime_login
└── 05_auth.sql          on_auth_user_created trigger (Supabase GoTrue)
```

### 2.2 Schema পরিবর্তনের workflow

```
01_schema.sql edit → 02_policies.sql RLS add → pnpm db:migrate → pnpm db:gen → test লিখো
```

### 2.3 RLS Policy Pattern

```sql
-- 02_policies.sql-এ যোগ করো
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON new_table
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Write policy (শুধু নিজের tenant)
CREATE POLICY "tenant_write" ON new_table FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### 2.4 withTenant Pattern

```ts
import { withTenant } from "@hybrid/db";

// SELECT
const rows = await withTenant(tenantId, userId, (tx) =>
  tx<Product[]>`
    SELECT id, name, price, stock
    FROM product
    WHERE active = true
    ORDER BY created_at DESC
  `
);

// INSERT
const [product] = await withTenant(tenantId, userId, (tx) =>
  tx<Product[]>`
    INSERT INTO product (tenant_id, name, price, slug)
    VALUES (${tenantId}, ${name}, ${price}, ${slug})
    RETURNING *
  `
);

// UPDATE
await withTenant(tenantId, userId, (tx) =>
  tx`
    UPDATE product
    SET name = ${name}, updated_at = NOW()
    WHERE id = ${productId}
  `
);

// Transaction (atomic — inventory + order)
await withTenant(tenantId, userId, async (tx) => {
  await tx`UPDATE product SET stock = stock - ${qty} WHERE id = ${productId} AND stock >= ${qty}`;
  const [order] = await tx`INSERT INTO "order" (...) RETURNING *`;
  return order;
});
```

### 2.5 TypeScript Types

```ts
// packages/db/src/types.ts থেকে (kysely-codegen generate করে)
import type { Product, Order, Customer, Tenant } from "@hybrid/db";

// Type generation
// pnpm db:gen  (DIRECT_URL লাগবে)
```

---

## PHASE 3 — API Routes

### 3.1 Route Structure

```
apps/web/app/api/
├── bkash/callback/route.ts         bKash server-side callback
├── internal/billing-sweep/route.ts CRON_SECRET gated
├── internal/courier-sync/route.ts  CRON_SECRET gated
└── admin/upload/route.ts           Image upload (mime/size sanitized)
```

### 3.2 API Route Pattern

```ts
// app/api/admin/example/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@hybrid/db";

export async function POST(req: NextRequest) {
  // 1. Auth check
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Input parse ও validate
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "নাম দেওয়া আবশ্যক" }, { status: 400 });
  }

  // 3. DB operation — withTenant দিয়ে
  const result = await withTenant(session.tenantId, session.userId, (tx) =>
    tx`INSERT INTO ... RETURNING *`
  );

  // 4. Response
  return NextResponse.json({ data: result });
}
```

### 3.3 Internal/CRON Endpoint Pattern

```ts
// CRON_SECRET validation — সব internal endpoint-এ
export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // ... rest
}
```

---

## PHASE 4 — Server Actions

### 4.1 Pattern

```ts
// app/(admin)/admin/products/actions.ts
"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@hybrid/db";
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  stock: z.number().int().min(0),
});

export async function createProduct(formData: FormData) {
  // 1. Auth
  const session = await getSession();
  if (!session) redirect("/login");

  // 2. Validate
  const parsed = ProductSchema.safeParse({
    name: formData.get("name"),
    price: Number(formData.get("price")),
    stock: Number(formData.get("stock")),
  });
  if (!parsed.success) throw new Error(parsed.error.message);

  // 3. DB — withTenant
  await withTenant(session.tenantId, session.userId, (tx) =>
    tx`INSERT INTO product (tenant_id, name, price, stock)
       VALUES (${session.tenantId}, ${parsed.data.name}, ${parsed.data.price}, ${parsed.data.stock})`
  );

  // 4. Cache invalidate
  revalidateTag(`tenant:${session.tenantId}:products`);
  revalidateTag(`tenant:${session.tenantId}:dashboard`);
}
```

### 4.2 Cache Tag Reference

| Tag | Invalidate When |
|---|---|
| `tenant:{id}:products` | Product add/edit/delete |
| `tenant:{id}:product:{pid}` | Single product edit |
| `tenant:{id}:orders` | Order create/status change |
| `tenant:{id}:order:{oid}` | Single order mutation |
| `tenant:{id}:customers` | Customer note/tag edit |
| `tenant:{id}:dashboard` | Any metric-affecting mutation |
| `tenant:{id}:cod` | COD delivery status change |
| `tenant:{id}:collections` | Collection create/edit/delete |
| `tenant:{id}:theme` | Theme settings update |
| `tenant-slug:{slug}` | Slug/domain change |

---

## PHASE 5 — Auth System

### 5.1 getSession() — Session Reading

```ts
import { getSession } from "@/lib/auth/session";

const session = await getSession();
// session = { userId, tenantId, role } | null
```

**Production:** `AUTH_PROVIDER=supabase` → Supabase GoTrue credential authority → app opaque `hybrid_session` cookie.

**Dev:** `AUTH_PROVIDER=` (unset) → HMAC-signed `hybrid_dev_session` cookie (dev-login).

### 5.2 Auth Guard Pattern

```ts
// Server Component
const session = await getSession();
if (!session) redirect("/login");

// API Route
const session = await getSession();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// Platform admin guard
if (session.role !== "platform_admin") redirect("/");
```

### 5.3 Supabase GoTrue (Production)

```ts
// lib/auth/supabaseAuth.ts
// Login: email+password → GoTrue verify → map to app_user by email → mint hybrid_session
// Signup: GoTrue createUser (email-confirmed) + provisionTenant()

// Required env:
// SUPABASE_URL=http://supabase-kong:8000
// SUPABASE_ANON_KEY=...
// SUPABASE_SERVICE_ROLE_KEY=...
```

---

## PHASE 6 — Payment Integration

### 6.1 bKash Tokenized Checkout Flow

```ts
import { BkashProvider } from "@hybrid/payments";
import { openCredentials } from "@hybrid/db";

// 1. Tenant creds decrypt করো
const creds = await openCredentials(encryptedCreds, process.env.APP_ENCRYPTION_KEY!);

// 2. Provider তৈরি করো
const bkash = new BkashProvider({
  appKey: creds.appKey,
  appSecret: creds.appSecret,
  username: creds.username,
  password: creds.password,
  sandbox: process.env.NODE_ENV !== "production",
  tokenStore: redisTokenStore,  // bkash:token:{tenantId}
});

// 3. Payment create
const payment = await bkash.createPayment({
  amount: "1500.00",
  orderId: order.id,
  reference: order.number,
  callbackURL: `${baseUrl}/api/bkash/callback`,
});

// 4. Redirect to payment.bkashURL

// 5. Callback (app/api/bkash/callback/route.ts)
// handleBkashCallback() → execute → amount verify (paisa-exact) → replay guard
```

### 6.2 Amount Verification (Critical)

```ts
// MUST verify — bKash man-in-the-middle attack vector
if (executeResult.amount !== order.total.toFixed(2)) {
  await markPaymentFailed(order.id, "amount_mismatch");
  return;
}
```

### 6.3 COD Provider

```ts
import { CodProvider } from "@hybrid/payments";

const cod = new CodProvider();
// instant confirm — no external API call
const result = await cod.createPayment({ orderId, amount });
// result.status === "completed" immediately
```

### 6.4 Credential Sealing (সবসময়)

```ts
import { sealCredentials, openCredentials } from "@hybrid/db";

// Save
const sealed = await sealCredentials(
  { appKey, appSecret, username, password },
  process.env.APP_ENCRYPTION_KEY!
);
await tx`UPDATE tenant_settings SET bkash_creds = ${sealed} WHERE tenant_id = ${tenantId}`;

// Read
const creds = await openCredentials(row.bkash_creds, process.env.APP_ENCRYPTION_KEY!);
```

**Plaintext secrets নিষিদ্ধ — code, logs, chat সবখানে।**

---

## PHASE 7 — Courier Integration

### 7.1 Steadfast Provider

```ts
import { SteadfastProvider } from "@hybrid/couriers";

const steadfast = new SteadfastProvider({
  apiKey: creds.apiKey,
  apiSecret: creds.apiSecret,
  sandbox: false, // Steadfast-এর sandbox নেই
});

// Consignment create
const result = await steadfast.createConsignment({
  recipientName: customer.name,
  recipientPhone: customer.phone,
  recipientAddress: order.address,
  codAmount: order.codAmount,
  note: `Order #${order.number}`,
});

// Status poll
const status = await steadfast.getStatus(consignmentId);
// status.status → mapped via statusMap.ts
```

### 7.2 New Courier Adapter Pattern

```ts
// packages/couriers/src/newcourier.ts
import type { CourierAdapter, ConsignmentInput, StatusResult } from "./types";

export class NewCourierProvider implements CourierAdapter {
  async createConsignment(input: ConsignmentInput): Promise<{ consignmentId: string }> {
    // API call
  }

  async getStatus(consignmentId: string): Promise<StatusResult> {
    // API call → internal status map
  }
}
```

### 7.3 Courier Sync Flow

```ts
// lib/couriers/sync.ts → courierSync()
// 1. sent_to_courier অর্ডার লোড করো (withTenant)
// 2. Steadfast status poll করো
// 3. Status map করো (statusMap.ts)
// 4. Order আপডেট করো (withTenant)
// 5. delivered → COD collection-এ যোগ হয়
```

---

## PHASE 8 — Storage (File Upload)

### 8.1 MinIO/S3 Upload

```ts
import { getBlobStore } from "@/lib/storage";

const store = getBlobStore(); // BLOB_DRIVER=s3 → SupabaseBlobStore

const url = await store.upload({
  key: `tenants/${tenantId}/products/${filename}`,
  body: buffer,
  contentType: "image/webp",
  public: true,
});
// url → https://cdn.hybrid.ecomex.cloud/hybrid-media/tenants/.../filename
```

### 8.2 Image Upload Security (app/api/admin/upload/)

```ts
// Sanitize করো — অবশ্যই
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

if (!ALLOWED_MIME.includes(file.type)) throw new Error("অনুমোদিত নয়");
if (file.size > MAX_SIZE) throw new Error("ফাইল সাইজ বেশি");
// filename sanitize — path traversal guard
const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
```

---

## PHASE 9 — Redis Cache

### 9.1 Client

```ts
import { redis } from "@/lib/redis/client";
// ioredis, REDIS_URL env

await redis.set("key", "value", "EX", 3600);
const val = await redis.get("key");
await redis.del("key");
```

### 9.2 Tenant Resolution Cache

```ts
// lib/tenant/resolve.ts
// Redis TTL 1h → DB fallback
// Key: tenant:host:{hostname}
// Value: JSON(Tenant)
```

### 9.3 bKash Token Cache

```ts
// Key: bkash:token:{tenantId}
// TTL: token expiry - 5 min buffer
```

---

## PHASE 10 — Rate Limiting

```ts
import { rateLimit } from "@/lib/ratelimit";

// Signup ও checkout-এ apply করো
const { success } = await rateLimit(ip, "checkout", { max: 10, window: "1m" });
if (!success) {
  return NextResponse.json({ error: "অনেক বেশি request" }, { status: 429 });
}
```

---

## PHASE 11 — Error Handling Rules

```ts
// 1. Silent failure নিষিদ্ধ
// 2. User-facing error বাংলায়
// 3. Internal error log করো (console.error) — stack trace সহ
// 4. Sensitive data error message-এ রাখো না

try {
  await withTenant(tenantId, userId, ...);
} catch (err) {
  console.error("[product:create]", err); // internal log
  throw new Error("পণ্য তৈরি করা যায়নি। আবার চেষ্টা করুন।"); // user-facing Bengali
}
```

---

## PHASE 12 — Testing Pattern

```ts
// packages/db/test/newfeature.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { withTenant, asPlatformAdmin } from "@hybrid/db";

describe("new feature", () => {
  let tenantId: string;

  beforeAll(async () => {
    // global-setup.ts বুট করা embedded-postgres ব্যবহার করে
    tenantId = /* seed থেকে পাও */;
  });

  it("tenant isolation — tenant A cannot see tenant B data", async () => {
    const rowsA = await withTenant(tenantIdA, userIdA, (tx) =>
      tx`SELECT * FROM new_table`
    );
    const rowsB = await withTenant(tenantIdB, userIdB, (tx) =>
      tx`SELECT * FROM new_table`
    );
    // RLS নিশ্চিত করো
    expect(rowsA.every(r => r.tenant_id === tenantIdA)).toBe(true);
    expect(rowsB.every(r => r.tenant_id === tenantIdB)).toBe(true);
  });

  it("prevents cross-tenant write", async () => {
    await expect(
      withTenant(tenantIdA, userIdA, (tx) =>
        tx`UPDATE new_table SET name = 'hack' WHERE tenant_id = ${tenantIdB}`
      )
    ).resolves.toHaveLength(0); // RLS blocks it — no rows affected
  });
});
```

---

## PHASE 13 — Implementation Checklist

কোড লেখার পর প্রতিটি চেক করো:

- [ ] সব tenant data `withTenant()` দিয়ে — raw sql নেই
- [ ] Platform/CRON data `asPlatformAdmin()` দিয়ে
- [ ] Payment credentials `sealCredentials()` দিয়ে encrypted
- [ ] CRON endpoints `CRON_SECRET` দিয়ে গার্ড করা
- [ ] Auth check প্রতিটি Server Action ও API route-এ
- [ ] Amount verification bKash callback-এ
- [ ] Replay guard idempotent payment-এ
- [ ] `revalidateTag()` সব mutation-এ
- [ ] Bengali error messages user-facing সব জায়গায়
- [ ] Rate limit signup ও checkout-এ
- [ ] Image upload mime/size sanitized
- [ ] No plaintext secrets anywhere
- [ ] New table → RLS policy in `02_policies.sql`
- [ ] `pnpm db:gen` রান করে `types.ts` আপডেট
- [ ] টেস্ট লিখেছো (tenant isolation প্রমাণ করে)
- [ ] `pnpm --filter @hybrid/db test` — সব 63 পাস

---

## PHASE 14 — Environment Variables Reference

```bash
# Database
DATABASE_URL=postgres://app_runtime_login:...@supabase-db:5432/postgres
DIRECT_URL=postgres://postgres:...@supabase-db:5432/postgres

# Auth
AUTH_PROVIDER=supabase
SUPABASE_URL=http://supabase-kong:8000
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Storage
BLOB_DRIVER=s3
S3_ENDPOINT=http://supabase-minio:9000
S3_BUCKET=hybrid-media
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
NEXT_PUBLIC_CDN_URL=https://cdn.hybrid.ecomex.cloud

# Security
APP_ENCRYPTION_KEY=<32-byte hex>  # Gateway/courier creds sealing
SESSION_SECRET=<32-byte hex>
CRON_SECRET=<random>
DEV_SESSION_SECRET=<dev only>

# Cache
REDIS_URL=redis://hybrid-redis:6379

# SMS
SMS_API_KEY=...
SMS_LIVE=false  # true in production

# App
NEXT_PUBLIC_ROOT_DOMAIN=hybrid.ecomex.cloud
NODE_ENV=production
```
