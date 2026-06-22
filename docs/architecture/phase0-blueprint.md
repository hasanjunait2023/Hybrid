# Hybrid — Phase 0 Architecture Blueprint (APPROVED at GATE 1, 2026-06-23)

Local-first. Scope: prove "admin edit → storefront update" + hard tenant isolation with ONE hardcoded theme. Honors docs/research/phase0-brief.md verbatim. Canonical SQL (docs/01_schema.sql, docs/02_policies.sql) must NOT be edited.

## 1. Monorepo layout (Turborepo + pnpm)
```
/ (repo root)
├─ package.json (pnpm workspaces + turbo)  pnpm-workspace.yaml  turbo.json
├─ docker-compose.yml      # postgres:16-alpine + redis:7-alpine
├─ .env.example  .env.local
├─ tsconfig.base.json
├─ apps/
│  ├─ web/                 # Next.js App Router — only running app in P0
│  └─ api/                 # FastAPI — EMPTY STUB (folder + README only)
└─ packages/
   ├─ db/    @hybrid/db     # postgres.js client, withTenant, migrate, types, SQL
   ├─ ui/    @hybrid/ui     # shadcn primitives + theme tokens (per docs/DESIGN.md)
   └─ config/ @hybrid/config # eslint, tsconfig, tailwind presets + no-raw-sql rule
```
All packages `private:true`, `"type":"module"`. NOT creating packages/payments|couriers in P0 (YAGNI; Phase 1).
- tsconfig.base.json: `strict:true`, `moduleResolution:"bundler"`, `noUncheckedIndexedAccess:true`, path alias `@hybrid/*`. config exports base/nextjs/library tsconfigs.
- ESLint flat config; config exports base, next, and the custom no-raw-sql rule.
- turbo pipeline: build(^build), lint, typecheck, test, db:migrate, db:seed.

## 2. packages/db
```
packages/db/
├─ sql/ 00_roles.sql 01_schema.sql 02_policies.sql 03_seed.sql 04_grant_login.sql
├─ src/ client.ts withTenant.ts migrate.ts types.ts index.ts
├─ scripts/generate-types.ts
├─ eslint.config.mjs package.json tsconfig.json
```
Copy docs/01_schema.sql + docs/02_policies.sql verbatim into packages/db/sql/ as 01/02.

### client.ts
```ts
import postgres from 'postgres'
export const sql = postgres(process.env.DATABASE_URL!, { max:10, idle_timeout:20, prepare:false })   // app_runtime_login → RLS ON
export const adminSql = postgres(process.env.DIRECT_URL!, { max:4, idle_timeout:20, prepare:false })  // postgres superuser → bypass RLS (migrations/seed/host-lookup)
```
client.ts is INTERNAL — package.json `exports` must NOT export `./client`. index.ts exports only withTenant, asPlatformAdmin, adminSql, types.

### withTenant.ts (verbatim — the contract)
```ts
import { sql } from './client'
type Tx = Parameters<Parameters<typeof sql.begin>[0]>[0]
export async function withTenant<T>(tenantId:string, userId:string|null, fn:(tx:Tx)=>Promise<T>):Promise<T>{
  return sql.begin(async (tx)=>{
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    await tx`SELECT set_config('app.current_user_id', ${userId ?? ''}, true)`
    await tx`SELECT set_config('app.is_platform_admin', 'false', true)`
    return fn(tx)
  })
}
export async function asPlatformAdmin<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{
  return sql.begin(async (tx)=>{
    await tx`SELECT set_config('app.current_tenant_id', '', true)`
    await tx`SELECT set_config('app.current_user_id', '', true)`
    await tx`SELECT set_config('app.is_platform_admin', 'true', true)`
    return fn(tx)
  })
}
```
Invariants: set_config(...,true) transaction-local; throw→auto ROLLBACK; prepare:false; callers use `tx` never raw `sql`.

### migrate.ts
Apply sql/*.sql in lexical order over adminSql (DIRECT_URL superuser). Tiny `_migrations` ledger table for idempotent re-runs. `db:migrate` = 00,01,02,04; `db:seed` = 03. (Also auto-applied by docker initdb on first boot.)

### Types — kysely-codegen (decision)
Introspect DIRECT_URL (local Docker) → emit enums + row types to src/types.ts. Do NOT adopt Kysely query builder — only consume types. `pnpm db:gen` manual after schema change; CI runs gen + `git diff --exit-code`.

### no-raw-sql ESLint rule (packages/config/eslint/no-raw-sql.mjs)
no-restricted-imports forbidding `@hybrid/db/client` and `postgres` in apps/web/** and consumers.

## 3. NOLOGIN fix — bookend files, canonical 01/02/03 untouched
- 00_roles.sql (runs FIRST): create `app_runtime_login LOGIN PASSWORD 'app_runtime_local_pw' INHERIT` (idempotent).
- 04_grant_login.sql (runs LAST, after 02 creates app_runtime group+grants): `grant app_runtime to app_runtime_login;`
- Order: 00 → 01 → 02 → 03(seed, superuser) → 04. DATABASE_URL=app_runtime_login; DIRECT_URL=postgres.

## 4. 03_seed.sql (fixed UUIDs for tests)
- 4 plans: free(0,50 prod,100 ord), starter(799), growth(2499), pro(4999).
- 1 theme: id `00000000-...-aa` code 'aurora' (storefront theme is "Doreja" per DESIGN.md; theme row code can stay 'aurora' or rename — align with frontend). default_settings colors+font.
- 3 users: owner-a `11111111-...-001`, owner-b `...-002`, platform admin `...-0ff` (is_platform_admin=true).
- 2 tenants: A `aaaaaaaa-...-00a` slug store-a; B `bbbbbbbb-...-00b` slug store-b. status active, plan starter, locale bn.
- memberships owner role; tenant_domain store-a.lvh.me / store-b.lvh.me (subdomain, verified=true, is_primary).
- tenant_theme_settings active per tenant (A accent #1D4ED8 area, B distinct accent for visible proof).
- store_page home published per tenant.
- 3 active products + 1 variant (position 0, price) each tenant. Do NOT pre-seed order_counter (test exercises trigger).

## 5. Auth seam (P0 stub, not throwaway)
apps/web/lib/auth/session.ts → `getSession():Promise<{userId:string,tenantId:string|null}|null>`. P0 impl: signed dev cookie `hybrid_dev_session` set by `/dev-login?as=owner-a|owner-b|admin` (maps to seeded app_user ids), guarded `NODE_ENV!=='production'`. Phase 1 swaps body to Supabase session lookup, callers unchanged. withTenant takes userId; storefront anonymous reads pass userId=null.

## 6. middleware.ts (apps/web/middleware.ts)
```ts
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN! // lvh.me dev / myhybrid.com prod
export const config = { matcher:['/((?!api/|_next/|_static/|[\\w-]+\\.\\w+).*)'] }
export default async function middleware(req){
  const url=req.nextUrl
  const host=(req.headers.get('host')??'').split(':')[0]
  const isRoot = host===ROOT || host===`www.${ROOT}`
  const sub = host.endsWith(`.${ROOT}`) ? host.slice(0,-(ROOT.length+1)) : null
  if(isRoot) return NextResponse.next()                                   // marketing
  if(sub==='app')   return NextResponse.rewrite(new URL(`/platform${url.pathname}`,req.url))
  if(sub==='admin') return NextResponse.rewrite(new URL(`/admin${url.pathname}`,req.url))
  const tenant = await resolveTenantByHost(host)
  if(!tenant) return NextResponse.rewrite(new URL('/store-not-found',req.url))
  return NextResponse.rewrite(new URL(`/_sites/${tenant.slug}${url.pathname}`,req.url))
}
```
lib/tenant/resolve.ts: resolveTenantByHost(host) → Redis `domain:{host}` TTL 1h (cache null 60s) → miss: asPlatformAdmin lookup tenant_domain⋈tenant where domain=host AND verified → {id,slug}. invalidateDomainCache(domain) exists (Phase 2 use). Redis local redis:7-alpine REDIS_URL=redis://localhost:6379, behind interface so Upstash swaps by env.

## 7. apps/web/app tree
```
(marketing)/page.tsx              # STUB static Hybrid landing
(platform)/platform/page.tsx      # STUB placeholder
(admin)/admin/layout.tsx          # getSession→tenantId
(admin)/admin/products/page.tsx   # list (withTenant)            BUILD
(admin)/admin/products/[id]/edit/page.tsx + actions.ts          BUILD
_sites/[tenant]/layout.tsx        # load theme settings→tokens   BUILD
_sites/[tenant]/page.tsx          # home: hero + featured        BUILD
_sites/[tenant]/products/page.tsx # product list                 BUILD
store-not-found/page.tsx          # branded                      BUILD
dev-login/route.ts                # dev-only auth stub           BUILD
```

## 8. Render + ISR
lib/storefront/data.ts getStorefrontProducts(tenantId): unstable_cache(()=>withTenant(tenantId,null,tx=>tx`select p.id,p.title,p.slug,(select min(price) from product_variant v where v.product_id=p.id) as price from product p where p.status='active' order by p.created_at desc`), [`products:${tenantId}`], { revalidate:3600, tags:[`tenant:${tenantId}`,`tenant:${tenantId}:products`] })().
Admin updateProduct Server Action: getSession→withTenant(tenantId,userId, update product + variant) → revalidateTag(`tenant:${tid}:products`) + `:product:${id}`. Zod validate.
Tag scheme: tenant:{id} / :products / :product:{id} / :theme / :page:{slug} / :navigation.

## 9. RLS Vitest suite (packages/db/test/rls.test.ts) — THE GATE
5 tests using fixed seed UUIDs (A,B,OWNER_A): (1) A sees only A products; (2) A reads B → 0 rows; (3) cross-tenant INSERT rejects (WITH CHECK); (4) asPlatformAdmin sees A and B; (5) order_number per-tenant independent (A:1, B:1, A:2). order_counter under RLS PROVEN to succeed (SECURITY INVOKER, NEW.tenant_id=current tenant passes WITH CHECK; app_runtime_login has grants). CI: postgres+redis services → install → db:migrate+seed → vitest → lint+typecheck. Required check every PR.

## 10. Local runbook
docker-compose mounts packages/db/sql → /docker-entrypoint-initdb.d:ro (00→04 lexical). .env.local: DATABASE_URL=postgres://app_runtime_login:app_runtime_local_pw@localhost:5432/hybrid, DIRECT_URL=postgres://postgres:postgres@localhost:5432/hybrid, NEXT_PUBLIC_ROOT_DOMAIN=lvh.me, REDIS_URL=redis://localhost:6379, cloud vars stubbed, APP_ENCRYPTION_KEY dev. Run: docker compose up -d → pnpm install → pnpm --filter @hybrid/db db:gen → pnpm dev. Visit store-a.lvh.me:3000 (A), store-b.lvh.me:3000 (B), admin.lvh.me:3000/dev-login?as=owner-a then /admin/products, lvh.me:3000 marketing, nope.lvh.me:3000 → not-found.

## 11. Build slices → owners
- SLICE 0 (backend, sequential, blocks all): Turborepo skeleton + packages/config (+ no-raw-sql rule); docker-compose; sql 00/01/02/03/04; migrate.ts; db:gen; client.ts+withTenant.ts+index.ts.
- SLICE 1 (backend): 03_seed.sql; RLS Vitest suite + CI; middleware.ts + lib/tenant/resolve.ts.
- SLICE 2 (frontend): _sites/[tenant] layout/home/products (withTenant+unstable_cache+tags); (admin) products list/edit + actions; dev-login + getSession; store-not-found + marketing/platform stubs.
- SLICE 3 (frontend, per docs/DESIGN.md): theme token system (CSS vars from tenant_theme_settings.settings) + storefront sections (hero, featured_products, product_grid) in @hybrid/ui + product card + Bangla font loading (Hind Siliguri) + shadcn token overrides.
Backend (S0+S1) lands contracts first; frontend (S2+S3) consumes them.

## 12. Risks
R1(Med) unstable_cache per-instance on Vercel → Upstash cache handler (Phase 1 seam). R2(Low) unstable_cache→'use cache' migration (centralized in lib/storefront/data.ts). R3(Low) kysely-codegen drift (CI diff check). R4(Low) dev-login dev-only (NODE_ENV guard + review).
Still open (non-blocking P0, needed Phase 1): bKash tier, apex domain, Starter price (৳799 placeholder).
