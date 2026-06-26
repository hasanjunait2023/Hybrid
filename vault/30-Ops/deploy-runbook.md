---
type: ops
---

# Deploy runbook

Canonical: [[docs/INFRA_SUPABASE|docs/INFRA_SUPABASE.md]] + [[docs/DEPLOY|docs/DEPLOY.md]]. Quick ref:

## Hosts
- VPS `72.62.228.196`, SSH alias `mt5vps` (root). App at `/opt/hybrid`.
- Containers: `hybrid-web` (Next), `hybrid-caddy` (proxy, 80/443), `hybrid-redis`,
  `supabase-db-pe9o2li2n3bns3wnofob49uw`, kong/auth/rest/storage/minio/imgproxy/meta/studio.
- DB: `docker exec supabase-db-… psql -U postgres -d postgres`.

## Deploy code
See [[vault/30-Ops/git-vps-sync]] → "Deploy procedure". Migrations: apply new `sql/NN_*` via
`DIRECT_URL` then record in `_migrations`.

## Verify
- `docker logs hybrid-web` → "Ready".
- Origin (bypass CF): `curl --resolve hybrid.ecomex.cloud:443:72.62.228.196 https://hybrid.ecomex.cloud/`.
- Hosts: `app.` → super-admin (307→login), `admin.` → tenant admin, `{slug}.` → storefront.

## Gotchas
- tsc OOMs via pnpm wrapper → run node directly with `--max-old-space-size=6144`.
- `522` right after `--force-recreate web` = Cloudflare↔origin blip during swap; self-recovers.
- New `@hybrid/ui` changes need a full web rebuild (Next bundles the package).
