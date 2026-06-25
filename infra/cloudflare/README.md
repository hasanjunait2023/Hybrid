# Cloudflare Cache Setup — Phase A infrastructure prep

**Status:** Phase-A infrastructure prep — NOT YET APPLIED. Requires founder Cloudflare API token + manual script run.

## Purpose

Cloudflare edge caching is the **single biggest latency win** for Hybrid. Storefront HTML is cached at Cloudflare's global edge, served in < 50 ms to repeat visitors without touching the origin.

**Target:** Storefront cache-hit rate > 90% after Phase A.

> **PLAN NOTE (corrected 2026-06-25): the edge OVERRIDES the origin.** The
> storefront origin emits `Cache-Control: no-store` because the pages are
> unbounded multi-tenant dynamic routes (`/[tenant]/...`) that CANNOT be safely
> made static at the origin (one tenant's HTML must never leak to another — we
> deliberately did NOT add origin ISR). So `cloudflare-cache-setup.sh` uses an
> **`edge_ttl: override_origin` (60s)** rule with the **Host in the cache key** and
> hard bypass for the `hybrid_session` cookie + `/cart /checkout /order /account
> /api /admin /login` paths. No origin code change is required to start caching.
> Per-tenant instant purge needs Enterprise (Cache-Tag) — otherwise the 60s TTL
> self-heals staleness, or purge by URL (see `cloudflare-purge.sh`). The API token
> needs **Zone:Cache Rules edit** (for setup) + **Zone:Cache Purge** (for purge).

## Architecture

```
Client (Bangladesh, etc.)
        |
        v
   Cloudflare Edge
     (cached HTML)
        |
        | cache MISS or admin/API
        v
   Load Balancer
        |
   web instance(s)
        |
   Supabase (reads/writes)
```

## Files in this directory

- **cloudflare-cache-setup.sh** — creates cache rules via Cloudflare API
- **cloudflare-purge.sh** — purges edge cache by Cache-Tag
- **README.md** (this file)

## Prerequisites

1. **Cloudflare account** already owns `hybrid.ecomex.cloud` (via wildcard DNS)
2. **Cloudflare API token** with permissions:
   - `Zone:Cache Purge` (required)
   - `Zone Settings` (read, for diagnostics)
3. **Zone ID** for `hybrid.ecomex.cloud`

## Step 1: Get Cloudflare API token

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Account Settings → API Tokens** (top right)
3. Click **Create Token**
4. Choose template "Cache Purge" or "Edit zone cache"
5. Select **Zone Resources**: `hybrid.ecomex.cloud`
6. Permissions:
   - ✅ Zone:Cache Purge
   - ✅ Zone:Read
7. Click **Continue to Summary → Create Token**
8. **Copy the token immediately** (shown only once)

## Step 2: Get Zone ID

In [Cloudflare Dashboard](https://dash.cloudflare.com):
1. Select domain `hybrid.ecomex.cloud`
2. Right sidebar → **Account** section at bottom
3. Copy the **Zone ID**

## Step 3: Run cache setup

```bash
# On your local machine (not the VPS)
export CF_API_TOKEN='paste-your-token-here'
export CF_ZONE_ID='paste-your-zone-id-here'

bash infra/cloudflare/cloudflare-cache-setup.sh
```

**Expected output:**
```
✅ Storefront cache rule created
✅ CDN cache rule created
Cloudflare cache rules setup complete!
```

Verify in Cloudflare Dashboard → **Rules → Cache Rules** — you should see 2 new rules.

## Step 4: Code changes (per-tenant cache purge wiring)

**This is the MOST IMPORTANT step** — cache rules alone don't know *when* to purge.

### 4a. Update storefront responses to set Cache-Control headers

In `apps/web/app/_sites/[tenant]/layout.tsx` or a middleware/response headers file:

```typescript
// Set Cache-Control on storefront HTML pages
export const metadata: Metadata = {
  // ...
};

// In a Server Component or middleware:
headers().set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
headers().set('Cache-Tag', `tenant:${tenantId}:storefront`);
```

The `s-maxage=3600` tells Cloudflare to cache for 1 hour; the `Cache-Tag` enables per-tenant purge.

### 4b. Wire cache purge into the app

When a product/storefront is edited, the app calls `revalidateTag()` (ISR). **Also call the Cloudflare purge:**

In `apps/web/lib/admin/products.ts` or similar mutation handlers:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function updateProduct(tenantId: string, productId: string, data: any) {
  // Update DB via withTenant...
  await withTenant(tenantId, userId, async (tx) => {
    // UPDATE product SET ...
  });

  // ISR — local cache
  revalidateTag(`tenant:${tenantId}:products`);

  // Cloudflare edge cache — call the purge script
  try {
    await execAsync(
      `CF_API_TOKEN=$CF_API_TOKEN CF_ZONE_ID=$CF_ZONE_ID bash infra/cloudflare/cloudflare-purge.sh "tenant:${tenantId}:products"`,
      { env: process.env }
    );
  } catch (err) {
    // Log the purge error but don't fail the request
    console.error(`[Cache purge] Cloudflare purge failed for tenant ${tenantId}:`, err);
  }
}
```

**Alternative (async, non-blocking):** Queue the purge call in a background job (FastAPI jobs service) so it doesn't block the storefront edit response.

## Caching strategy by endpoint

| Endpoint | Cache rule | TTL | Purge on |
|---|---|---|---|
| `*.hybrid.ecomex.cloud/` (home) | storefront rule | 1 hour | product add/update/delete, settings change |
| `*.hybrid.ecomex.cloud/products/{slug}` | storefront rule | 1 hour | product update, collection change |
| `cdn.hybrid.ecomex.cloud/*` (images) | CDN rule | 1 year | image delete (rare) |
| `/admin/*` | excluded (not cached) | — | — |
| `/api/*` | excluded (not cached) | — | — |
| `/checkout` | excluded (not cached) | — | — |

## Monitoring

### Cache hit rate

In Cloudflare Dashboard:
- **Analytics → Caching** — watch "Cache Hit Rate" (target > 90%)
- **Cache Rules** — view each rule's hit count

### Purge verification

After running `cloudflare-purge.sh`, the edge cache for that tag is cleared within ~30 seconds. Next request will fetch from origin.

```bash
# Manually test: curl with cache headers
curl -v https://store-a.hybrid.ecomex.cloud/ 2>&1 | grep -i "cf-cache"

# Look for:
# cf-cache-status: HIT (served from edge)
# cf-cache-status: MISS (fetched from origin)
```

## Troubleshooting

**Cache rules exist but not caching?**

1. Verify storefront HTML includes `Cache-Control` header:
   ```bash
   curl -v https://store-a.hybrid.ecomex.cloud/ 2>&1 | grep -i cache-control
   ```
   Should see: `cache-control: public, s-maxage=3600, ...`

2. Check if origin is setting `Cache-Control: no-cache` or `private` (overrides edge cache).

3. Verify request matches the cache rule expression. In Cloudflare Dashboard, **Rules → Cache Rules → [your rule]** → **Test expression** with a sample URL.

**Purge API fails?**

```bash
# Debug the purge call
CF_API_TOKEN='your-token' CF_ZONE_ID='your-zone-id' bash -x infra/cloudflare/cloudflare-purge.sh "test-tag"
```

Check response for error details (usually expired token or wrong zone).

## Phase A vs Phase B

**Phase A (now):**
- Deploy cache rules
- Add Cache-Control headers in code
- Manual purge script (called from app)

**Phase B (multi-instance, later):**
- Redis-based cache handler (per-instance ISR → shared Redis pub/sub)
- Upstash or managed Redis HA for distributed purge
- Automated purge queue in FastAPI jobs service

## References

- [Cloudflare Cache Rules API docs](https://developers.cloudflare.com/cache/manage-cache-settings/edge-browser-cache-ttl/)
- [SCALING_PLAN.md — Phase A/B roadmap](../../docs/SCALING_PLAN.md)
- [Hybrid CLAUDE.md — cache-tag scheme](../../CLAUDE.md)
