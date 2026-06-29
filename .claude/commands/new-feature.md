# new-feature

নতুন ফিচার ইমপ্লিমেন্ট করার জন্য স্ট্যান্ডার্ড চেকলিস্ট।

## ব্যবহার

```
/new-feature <feature-description>
```

## Pre-Implementation Checklist

### 1. RLS নিশ্চিত করো
- সব tenant data `withTenant()` দিয়ে অ্যাক্সেস করতে হবে
- কোনো raw `sql` বা Supabase client ব্যবহার নিষিদ্ধ
- `no-raw-sql` ESLint rule বিল্ড-ব্রেকিং error দেবে

### 2. Schema পরিবর্তন হলে
- `packages/db/sql/01_schema.sql` আপডেট করো
- `packages/db/sql/02_policies.sql`-এ RLS policy যোগ করো
- `pnpm db:gen` রান করো → `types.ts` আপডেট করো
- নতুন টেস্ট লিখো `packages/db/test/`-এ

### 3. UI নিয়ম
- Mobile-first: সব tap target ≥ 44px
- Bengali-first: customer-facing টেক্সট বাংলায়
- Bangla numerals: storefront-এ (admin-এ Latin digits)
- Design tokens: `packages/ui/src/globals.css` থেকে
- shadcn/ui কম্পোনেন্ট ব্যবহার করো

### 4. Error Handling
- Silent failure নিষিদ্ধ
- User-facing error বাংলায়
- API error → toast notification

### 5. Cache Invalidation
যেকোনো mutation-এর পর `revalidateTag()` কল করো:
```ts
revalidateTag(`tenant:${tenantId}:products`);
```

## Implementation Steps

1. DB schema (যদি দরকার হয়)
2. `withTenant()` দিয়ে data layer
3. Server Action বা API route
4. UI কম্পোনেন্ট (mobile-first)
5. টেস্ট লিখো
6. `/db-check` রান করো — সব টেস্ট পাস হতে হবে
7. Dev server-এ ভেরিফাই করো

## Definition of Done

- [ ] Real DB/services-এ কাজ করছে (stub নেই)
- [ ] `withTenant()` দিয়ে tenant-safe
- [ ] সব টেস্ট পাস
- [ ] Error handled (বাংলায় user-facing)
- [ ] Mobile-first UI
- [ ] Cache invalidation সঠিক
- [ ] কোনো TODO বা plaintext secret নেই
