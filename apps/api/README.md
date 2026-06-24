# @hybrid/api — async jobs service (FastAPI)

Heavy / background jobs for Hybrid that don't belong in the Next.js request path —
**courier status sync** (Steadfast) today, **COD reconciliation** and other queue
workers next. Connects to the **same self-hosted Supabase Postgres** as the web
app and honors the **same RLS discipline**.

> Production reality: see [`docs/INFRA_SUPABASE.md`](../../docs/INFRA_SUPABASE.md).
> This service is **scaffolded, not yet deployed** — wire it into the prod compose +
> a scheduler when courier creds go live.

## The Golden Rule still applies

`app/db.py` mirrors `@hybrid/db` exactly:

- Pool connects as **`app_runtime_login`** (`DATABASE_URL`, non-superuser) → **RLS is FORCED**.
- `with_tenant(tenant_id)` / `as_platform_admin()` set the transaction-local GUCs
  (`set_config(..., true)`) the RLS policies filter on — never query tenant data
  on a raw connection without them.
- `statement_cache_size=0` == postgres.js `prepare:false` (pooler-safe).

Sealed credentials (`app/crypto.py`) are AES-256-GCM, **byte-compatible** with
`packages/db/src/crypto.ts`, so this service opens the exact `courier_account`
secrets the web app sealed.

## Layout

```
app/
  config.py        typed settings (fail-fast on missing secrets)
  crypto.py        SealedSecret open/seal (AES-256-GCM, compat with crypto.ts)
  db.py            asyncpg pool + with_tenant / as_platform_admin (RLS contract)
  security.py      CRON_SECRET bearer dependency (constant-time)
  logging_config.py
  main.py          app factory + lifespan (pool + httpx) + 500 handler
  routers/
    health.py      GET /health, GET /healthz/db
    jobs.py        POST /jobs/courier-sync   (CRON_SECRET-gated)
  couriers/
    status_map.py  Steadfast status -> internal (port of statusMap.ts)
    steadfast.py   httpx adapter (get_status)
    creds.py       read + decrypt courier_account creds (inside with_tenant)
    sync.py        sync_tenant_shipments + run_courier_sweep
  schemas/         Pydantic request/response models
tests/             pytest-asyncio + httpx (crypto, status_map, health, auth)
```

## Develop

```bash
cd apps/api
python -m venv .venv && . .venv/Scripts/activate   # (Linux/mac: . .venv/bin/activate)
pip install -e ".[dev]"
cp .env.example .env
pytest                          # unit tests (no DB/network needed)
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | liveness |
| GET | `/healthz/db` | none | DB readiness (503 if pool down) |
| POST | `/jobs/courier-sync` | `Authorization: Bearer <CRON_SECRET>` | reconcile Steadfast shipment statuses across all tenants |

Trigger the sweep:

```bash
curl -X POST http://localhost:8000/jobs/courier-sync \
  -H "Authorization: Bearer $CRON_SECRET"
# -> {"ok":true,"tenants":N,"synced":M,"skipped":K}
```

## Deploy (when going live)

1. Build: `docker build -t hybrid-jobs apps/api`.
2. Run on the Supabase Docker network so it resolves `supabase-db`:
   `docker run -d --name hybrid-jobs --network pe9o2li2n3bns3wnofob49uw --env-file .env hybrid-jobs`
   with `DATABASE_URL=postgres://app_runtime_login:<pw>@supabase-db:5432/postgres`.
3. Schedule `POST /jobs/courier-sync` (e.g. a cron container, or call it from the
   existing Next.js cron) with the shared `CRON_SECRET`.

## Notes / next

- **Cross-language crypto**: validated by shared format + round-trip tests. Before
  relying on it in prod, decrypt one real `courier_account.credentials` value from
  the DB to confirm end-to-end (no Node sandbox in CI to assert a fixed vector).
- **Live Steadfast** is deferred until a merchant account exists (no sandbox) —
  same as the TS side; the adapter is contract-shaped.
- **Next**: COD reconciliation worker (`lib/cod/recon.ts` port), and a real queue
  (arq/Redis) if trigger-driven sweeps outgrow synchronous execution.
