# SCHEMA

> Pointer file. The DB schema is **code**, not prose — the canonical DDL is the source of truth.
> Do not hand-maintain a schema description here (it would drift from the SQL).

## Canonical schema files (`packages/db/sql/`, applied in lexical order)
| File | Purpose |
|---|---|
| `00_roles.sql` | `app_runtime_login` LOGIN role (runs first) |
| `01_schema.sql` | **Full schema — canonical, do not edit** |
| `02_policies.sql` | **RLS policies — canonical, do not edit** |
| `03_seed.sql` | Dev seed: 2 tenants, 6 products, 4 plans |
| `04_grant_login.sql` | `GRANT app_runtime TO app_runtime_login` (runs last) |
| `05_auth.sql` | `on_auth_user_created` trigger (Supabase Auth path) |

Mirror copies for reference: [docs/01_schema.sql](01_schema.sql), [docs/02_policies.sql](02_policies.sql).

## Generated types
`packages/db/src/types.ts` — kysely-codegen output. Regenerate after any schema change:
```bash
pnpm db:gen   # needs live DIRECT_URL
```
Commit the updated `types.ts`.

## Self-hosted Supabase note
Hybrid schema lives in the **`postgres` database, `public` schema** (so GoTrue's `auth` schema
shares the DB). Both `DATABASE_URL` and `DIRECT_URL` target database `postgres`.
