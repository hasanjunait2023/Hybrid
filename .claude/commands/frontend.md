# frontend

Hybrid প্রজেক্টের জন্য Frontend Engineering — Next.js App Router, Tailwind, shadcn/ui, Bengali-first, Mobile-first।

## ব্যবহার

```
/frontend <task-description>
```

যেমন:
- `/frontend add product image gallery to storefront`
- `/frontend create order history page in admin`
- `/frontend build checkout location picker component`

---

## PHASE 1 — Context & Audit

### 1.1 টাস্ক বিশ্লেষণ

কোন zone-এ কাজ হবে নির্ধারণ করো:

| Zone | Host (dev) | Path prefix | Audience |
|---|---|---|---|
| **Storefront** | `<slug>.lvh.me:3000` | `app/_sites/[tenant]/` | Customer (Bengali) |
| **Admin** | `admin.lvh.me:3000` | `app/(admin)/admin/` | Seller (mixed) |
| **Platform** | `app.lvh.me:3000` | `app/(platform)/platform/` | Super-admin |
| **Marketing** | `lvh.me:3000` | `app/(marketing)/` | New sellers |

### 1.2 বিদ্যমান কোড পড়ো

কাজ শুরুর আগে এগুলো রিড করো:
- **UI টোকেন:** `packages/ui/src/globals.css`
- **বিদ্যমান কম্পোনেন্ট:** `packages/ui/src/components/`
- **Zone layout:** সংশ্লিষ্ট `layout.tsx`
- **Data fetching:** `apps/web/lib/storefront/data.ts` অথবা `apps/web/lib/admin/`

### 1.3 Server vs Client সিদ্ধান্ত

```
Server Component (default) → data fetch, static UI, no interactivity
Client Component ('use client') → useState, event handlers, browser APIs, cart, modals
```

**Rule:** যতটা সম্ভব Server Component রাখো। Client boundary শুধু interactive leaf-এ।

---

## PHASE 2 — Design System (অবশ্যই মানতে হবে)

### 2.1 Design Tokens (`packages/ui/src/globals.css` থেকে)

```css
/* Primary — Trust, CTA */
--color-primary: #1D4ED8;       /* Indigo */
--color-primary-hover: #1E40AF;

/* Accent — Sale, Warmth */
--color-accent: #F59E0B;        /* Marigold */

/* COD Trust Signal — সবসময় storefront-এ দৃশ্যমান */
--color-cod: #047857;           /* Green */

/* Neutral */
--color-surface: #FFFFFF;
--color-surface-muted: #F9FAFB;
--color-border: #E5E7EB;
--color-text: #111827;
--color-text-muted: #6B7280;
```

শুধু CSS variables ব্যবহার করো — hardcoded hex নিষিদ্ধ।

### 2.2 Typography

```css
/* Font: Hind Siliguri — Bengali + Latin */
font-family: 'Hind Siliguri', 'Noto Sans Bengali', sans-serif;

/* Scale */
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
--text-3xl: 1.875rem;
```

### 2.3 Numeral Rule

```tsx
// STOREFRONT — Bangla digits (customer-facing)
const price = (1500).toLocaleString('bn-BD');  // ১,৫০০

// ADMIN — Latin digits (operator-facing)
const price = (1500).toLocaleString('en-BD');  // 1,500
```

### 2.4 "Doreja" Storefront Theme (দরজা = doorway)

- 2-column mobile product grid
- Sticky bottom action bar (Add to Cart / Checkout)
- NO carousels — static grid only
- COD green badge সবসময় visible
- Light mode only (dark mode = lower trust in BD)

---

## PHASE 3 — Mobile-First Rules (Non-Negotiable)

### 3.1 Tap Targets

```tsx
// MINIMUM 44px — সব clickable element
<button className="min-h-[44px] min-w-[44px] px-4">
<a className="block min-h-[44px] flex items-center">
```

### 3.2 Bottom Sheet Pattern (mobile modal)

```tsx
// Desktop → Dialog, Mobile → bottom sheet
import { Sheet, SheetContent } from "@/components/ui/sheet";

<Sheet>
  <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh]">
    {/* content */}
  </SheetContent>
</Sheet>
```

### 3.3 Mobile-First Tailwind

```tsx
// সবসময় mobile থেকে শুরু, desktop-এ override
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
<div className="text-sm md:text-base">
<div className="p-3 md:p-6">
```

### 3.4 Image Optimization

```tsx
import Image from "next/image";

// CORRECT — Next.js Image দিয়ে
<Image
  src={product.imageUrl}
  alt={product.name}
  width={400}
  height={400}
  className="object-cover rounded-lg"
  sizes="(max-width: 768px) 50vw, 25vw"
/>
```

---

## PHASE 4 — Data Fetching Patterns

### 4.1 Server Component Data Fetch

```tsx
// app/_sites/[tenant]/products/page.tsx
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";

export default async function ProductsPage({ params }) {
  const tenant = await resolveTenantByHost(/* host */);
  const products = await withTenant(tenant.id, null, (tx) =>
    tx`SELECT * FROM product WHERE tenant_id = ${tenant.id} AND active = true`
  );

  return <ProductGrid products={products} />;
}
```

### 4.2 Cached Storefront Data

```tsx
// lib/storefront/data.ts pattern
import { unstable_cache } from "next/cache";

const getProducts = unstable_cache(
  async (tenantId: string) => {
    return withTenant(tenantId, null, (tx) =>
      tx`SELECT * FROM product WHERE active = true`
    );
  },
  ["products"],
  {
    tags: [`tenant:${tenantId}:products`],
    revalidate: 3600,
  }
);
```

### 4.3 Server Action (mutation)

```tsx
// app/(admin)/admin/products/actions.ts
"use server";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";

export async function updateProduct(productId: string, data: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await withTenant(session.tenantId, session.userId, (tx) =>
    tx`UPDATE product SET name = ${data.get("name")} WHERE id = ${productId}`
  );

  // Cache invalidate — অবশ্যই
  revalidateTag(`tenant:${session.tenantId}:products`);
  revalidateTag(`tenant:${session.tenantId}:product:${productId}`);
}
```

### 4.4 Force Dynamic (auth-gated routes)

```tsx
// (admin)/admin/layout.tsx এবং (platform)/platform/layout.tsx
// অবশ্যই এই line থাকতে হবে — না থাকলে Next.js build-time-এ 307 cache করে ফেলে
export const dynamic = "force-dynamic";
```

---

## PHASE 5 — shadcn/ui Component Usage

### 5.1 Available Components

```
Button, Badge, Card, Dialog, Sheet (mobile modal),
Table, Form, Input, Select, Textarea, Checkbox,
Toast (Sonner), Skeleton, Separator, Avatar,
DropdownMenu, Command, Popover, Tabs
```

### 5.2 Form Pattern (react-hook-form + zod)

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "নাম দিন"),
  price: z.number().min(0, "মূল্য দিন"),
});

export function ProductForm() {
  const form = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(data: z.infer<typeof schema>) {
    await updateProduct(data); // Server Action
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>পণ্যের নাম</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage /> {/* Bengali error message */}
          </FormItem>
        )} />
      </form>
    </Form>
  );
}
```

### 5.3 Toast Notification

```tsx
import { toast } from "sonner";

// Success
toast.success("পণ্য সফলভাবে আপডেট হয়েছে");

// Error (Bengali)
toast.error("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন");
```

---

## PHASE 6 — Bengali-First Rules

### 6.1 Storefront সব text বাংলায়

```tsx
// CORRECT
<h1>আমাদের পণ্যসমূহ</h1>
<button>কার্টে যোগ করুন</button>
<p>ক্যাশ অন ডেলিভারি উপলব্ধ</p>
<span className="text-[--color-cod]">ক্যাশ অন ডেলিভারি</span>

// WRONG — storefront-এ English
<button>Add to Cart</button>
```

### 6.2 Admin mixed (operator comfort)

```tsx
// Admin-এ key terms English, descriptions Bengali চলে
<th>SKU</th>
<td>স্টক শেষ হয়ে গেছে</td>
```

### 6.3 Error Messages (সবসময় Bengali — user-facing)

```tsx
const ERRORS = {
  outOfStock: "দুঃখিত, এই পণ্যটি এই মুহূর্তে পাওয়া যাচ্ছে না",
  paymentFailed: "পেমেন্ট সফল হয়নি। আবার চেষ্টা করুন",
  serverError: "কিছু একটা সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন",
  required: "এই তথ্যটি দেওয়া আবশ্যক",
};
```

---

## PHASE 7 — Performance & Loading States

### 7.1 Suspense Boundaries

```tsx
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

<Suspense fallback={<ProductGridSkeleton />}>
  <ProductGrid tenantId={tenant.id} />
</Suspense>
```

### 7.2 Skeleton Pattern

```tsx
function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
```

### 7.3 Optimistic UI

```tsx
import { useOptimistic } from "react";

const [optimisticItems, addOptimistic] = useOptimistic(
  cartItems,
  (state, newItem) => [...state, newItem]
);
```

---

## PHASE 8 — Image Upload (Admin)

```tsx
// API route: app/api/admin/upload/route.ts
// Allowed: jpeg, png, webp — max 5MB
// Sanitized: filename, mime type, size

const formData = new FormData();
formData.append("file", file);

const res = await fetch("/api/admin/upload", {
  method: "POST",
  body: formData,
});
const { url } = await res.json();
// url → cdn.hybrid.ecomex.cloud/... (MinIO public CDN)
```

---

## PHASE 9 — Implementation Checklist

কোড লেখার পর প্রতিটি চেক করো:

- [ ] Server Component-এ `withTenant()` দিয়ে data fetch (raw sql নেই)
- [ ] `export const dynamic = "force-dynamic"` auth-gated layout-এ আছে
- [ ] সব tap target ≥ 44px
- [ ] Storefront text বাংলায়, Bangla digits
- [ ] Admin-এ Latin digits
- [ ] Error messages বাংলায়
- [ ] Loading state / Skeleton আছে
- [ ] Mobile layout (grid-cols-2, bottom sheet) ঠিক আছে
- [ ] CSS variables ব্যবহার করা হয়েছে (hardcoded hex নেই)
- [ ] Server Action-এ `revalidateTag()` কল হচ্ছে
- [ ] Image → Next.js `<Image>` কম্পোনেন্ট
- [ ] COD badge সবসময় visible (storefront-এ)
- [ ] `safeUrl()` ব্যবহার করা হয়েছে external URL-এ

---

## PHASE 10 — Verification

কাজ শেষে:

1. `pnpm typecheck` — TypeScript error নেই
2. `pnpm lint` — ESLint পাস (no-raw-sql rule সহ)
3. Dev server-এ ব্রাউজার টেস্ট:
   - Mobile viewport (375px) এ দেখতে কেমন
   - Bengali text render হচ্ছে কিনা
   - Interactive element কাজ করছে কিনা
4. `pnpm --filter @hybrid/db test` — কোনো regression নেই
