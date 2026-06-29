# db-migrate

Database migration রান করো।

## ব্যবহার

```
/db-migrate
```

## SQL ফাইলের ক্রম (অবশ্যই এই ক্রমে)

```
packages/db/sql/
├── 00_roles.sql        → app_runtime_login LOGIN role তৈরি (প্রথমে)
├── 01_schema.sql       → Full schema (tables, indexes)
├── 02_policies.sql     → RLS policies
├── 03_seed.sql         → Dev seed data (dev only)
├── 04_grant_login.sql  → GRANT app_runtime TO app_runtime_login (শেষে)
└── 05_auth.sql         → Supabase Auth trigger
```

## Local (Docker) Migration

```bash
pnpm db:migrate
```

`DIRECT_URL` (postgres superuser) দিয়ে চলে।

## Production Migration (VPS)

Production Supabase DB-তে migration সরাসরি apply করো:

```bash
# VPS-এ SSH করো
# supabase-db container-এ psql
docker exec -i supabase-db psql -U postgres -d postgres < packages/db/sql/01_schema.sql
docker exec -i supabase-db psql -U postgres -d postgres < packages/db/sql/02_policies.sql
docker exec -i supabase-db psql -U postgres -d postgres < packages/db/sql/04_grant_login.sql
```

**সতর্কতা:** Production-এ `03_seed.sql` রান করো না — এটা শুধু dev seed।

## Type Generation (migration-এর পর)

```bash
pnpm db:gen
```

`packages/db/src/types.ts` আপডেট হবে। কমিট করো।

## Migration যাচাই

```bash
# app_runtime_login কাজ করছে কিনা
pnpm --filter @hybrid/db test rls
```

সব 5 RLS টেস্ট পাস হলে migration সফল।
