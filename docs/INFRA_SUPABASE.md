# Infra — Self-hosted Supabase on the VPS (production runbook)

The entire Hybrid backend runs on a **self-hosted Supabase stack** on a single VPS, in Docker.
This is the authoritative operational doc. Migrated 2026-06-25 (replaced the local
`hybrid-postgres` + dev-login + local-blob setup).

> This **reversed** the older "Phase 2 drops Supabase / Vercel + Supabase Cloud" plan. Ignore
> those; this is the live reality.

## Host & access

| | |
|---|---|
| VPS | `72.62.228.196` — Ubuntu 24.04, 2 vCPU / 8 GB / ~96 GB disk |
| SSH | alias `mt5vps` (root) — `~/.ssh/config` on the founder's machine |
| Root domain | `hybrid.ecomex.cloud` — Cloudflare wildcard `*.hybrid.ecomex.cloud` → VPS |
| TLS | Caddy auto-TLS (Let's Encrypt HTTP-01 through Cloudflare) |

## Two Docker stacks (one box)

**1. Hybrid app** — `/opt/hybrid` (plain source tree, NOT git), `docker-compose.prod.yml`,
deployed via `deploy.sh` (`docker compose --env-file .env.deploy ... up -d --build`). Secrets in
`/opt/hybrid/.env.deploy` (never committed).

| Container | Role |
|---|---|
| `hybrid-web` | Next.js (`next start`, :3000). On networks `hybrid_default` + the Supabase net. |
| `hybrid-caddy` | reverse proxy :80/:443 → `web:3000`, and `cdn.*` → `supabase-minio`. On both networks. |
| `hybrid-redis` | ioredis cache (host→tenant, sessions) |
| `hybrid-postgres` | **legacy, unused** — kept as rollback net. Retire after soak: `docker stop hybrid-postgres` (keep volume). |

**2. Supabase** — Coolify-generated, project ref `pe9o2li2n3bns3wnofob49uw`, run **lean** from
`/data/coolify/services/pe9o2li2n3bns3wnofob49uw/docker-compose.trimmed.yml` (NOT via Coolify —
Coolify itself is stopped). External Docker network: `pe9o2li2n3bns3wnofob49uw`.

Running (10): `supabase-db`, `supabase-kong`, `supabase-auth` (GoTrue), `supabase-rest`,
`supabase-storage`, `supabase-minio`, `imgproxy`, `supabase-meta`, `supabase-studio`,
`minio-createbucket`.

**Dropped** to fit 8 GB (would OOM otherwise — exit 137): `supabase-analytics` (logflare),
`supabase-vector`, `realtime-dev`, `supabase-edge-functions`, `supabase-supavisor`. The trimmed
compose removes these services and the `depends_on` edges pointing at them.

## How the app uses Supabase

- **DB**: `supabase-db` (Supabase Postgres 15). Hybrid schema is in database **`postgres`**,
  schema **`public`**, sharing the DB with Supabase's `auth`/`storage` schemas.
  - `DATABASE_URL=postgres://app_runtime_login:...@supabase-db:5432/postgres` (RLS forced)
  - `DIRECT_URL=postgres://postgres:...@supabase-db:5432/postgres` (`asPlatformAdmin`; `postgres`
    has `BYPASSRLS`, not full superuser). `app_runtime_login` is non-superuser/non-bypassrls.
  - Schema was loaded with the canonical `packages/db/sql` set: `00,01,02,04,06,07` then `03` seed.
- **Auth**: `AUTH_PROVIDER=supabase`. GoTrue is the credential authority; login verifies there and
  the app mints its own `hybrid_session`. See `apps/web/lib/auth/supabaseAuth.ts` +
  `lib/auth/session.ts`. `SUPABASE_URL=http://supabase-kong:8000`, anon/service-role JWTs in env.
- **Storage**: `BLOB_DRIVER=s3` → MinIO. Bucket `hybrid-media`, public **GetObject-only** policy.
  Uploads go to `http://supabase-minio:9000`; public URLs are
  `https://cdn.hybrid.ecomex.cloud/hybrid-media/{tenant}/{uuid}.{ext}` (Caddy → MinIO).

## Credentials

- App secrets: `/opt/hybrid/.env.deploy`.
- Supabase internal secrets (DB password, JWTs, MinIO root, etc.):
  `/data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env`. Note Coolify indirection — the real anon
  JWT is `SERVICE_SUPABASEANON_KEY`, the service_role JWT is `SERVICE_SUPABASESERVICE_KEY`.
- Seed/admin GoTrue logins live in `auth.users` (manage in Studio).
- Migration safety backups: `/root/migration-backup-20260624-183313/` (pre-wipe Supabase public
  dump, old hybrid pg dump, original compose/env).

## Common operations

```bash
# Deploy code: update /opt/hybrid source, then
ssh mt5vps 'cd /opt/hybrid && docker compose --env-file .env.deploy -f docker-compose.prod.yml up -d --build web'

# On the 8 GB box, pause studio+meta during a web build to free RAM, then unpause:
ssh mt5vps 'docker pause supabase-studio-pe9o2li2n3bns3wnofob49uw supabase-meta-pe9o2li2n3bns3wnofob49uw'
#   ...build... then docker unpause the same.

# Start/stop the lean Supabase stack
ssh mt5vps 'cd /data/coolify/services/pe9o2li2n3bns3wnofob49uw && docker compose -p pe9o2li2n3bns3wnofob49uw -f docker-compose.trimmed.yml --env-file .env up -d'

# psql into the app DB
ssh mt5vps 'docker exec -it supabase-db-pe9o2li2n3bns3wnofob49uw psql -U postgres -d postgres'

# Create/inspect a GoTrue user (service_role via Kong)
#   POST http://supabase-kong:8000/auth/v1/admin/users  { email, password, email_confirm:true }

# MinIO admin (mc) — list/policy
ssh mt5vps 'docker run --rm --network pe9o2li2n3bns3wnofob49uw --entrypoint /bin/sh minio/mc -c "mc alias set m http://supabase-minio:9000 <user> <pass>; mc ls m/hybrid-media"'
```

## Gotchas (learned the hard way)

1. **Auth-gated route segments must be `force-dynamic`.** `(admin)/admin/layout.tsx` and
   `(platform)/platform/layout.tsx` set `export const dynamic = "force-dynamic"`. Without it, Next
   prerenders the no-cookie auth redirect at build time and serves a cached 307 that never checks
   the runtime session. Add it to any new authenticated segment.
2. **`docker exec` needs `-i`** to pipe SQL via heredoc (no `-i` = psql gets no stdin, silently
   no-ops).
3. **MinIO public bucket**: use a custom GetObject-only JSON policy, NOT mc's `download` canned
   policy (which also allows anonymous `ListBucket` → cross-tenant key enumeration).
4. **Network attach persists in compose**: `hybrid-web` and `hybrid-caddy` declare the external
   `pe9o2li2n3bns3wnofob49uw` network in `docker-compose.prod.yml` so a recreate keeps reaching
   `supabase-db` / `supabase-minio`. Don't rely on manual `docker network connect`.
5. **`pg_dump` v16 vs psql v15**: v16 emits `\restrict` which v15 psql rejects. Use `\copy` for
   cross-version row transfers.
