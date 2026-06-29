# health-check

Production VPS-এর সব সার্ভিস সুস্থ আছে কিনা চেক করো।

## ব্যবহার

```
/health-check
```

## চেকলিস্ট

### 1. Web Endpoints
| URL | কী হওয়া উচিত |
|---|---|
| `https://hybrid.ecomex.cloud` | Bengali landing page (200) |
| `https://app.hybrid.ecomex.cloud/platform` | Platform login/redirect (200/307) |
| `https://store-a.hybrid.ecomex.cloud` | Tenant A storefront (200) |
| `https://cdn.hybrid.ecomex.cloud` | MinIO CDN accessible |

### 2. Docker Services (VPS-এ)
```bash
docker ps --filter name=hybrid
docker ps --filter name=supabase
```

সব container `Up` স্ট্যাটাসে থাকা উচিত:
- `hybrid-web` (Next.js app)
- `hybrid-redis`
- `supabase-db`
- `supabase-kong`
- `supabase-auth`
- `supabase-storage`
- `supabase-minio`

### 3. Database Connectivity
```bash
# supabase-db কানেক্ট হচ্ছে কিনা
docker exec supabase-db psql -U postgres -c "SELECT COUNT(*) FROM public.tenant;"
```

### 4. Redis
```bash
docker exec hybrid-redis redis-cli ping
# Expected: PONG
```

### 5. Caddy (Reverse Proxy)
```bash
docker logs hybrid-web --tail 20
```
TLS সার্টিফিকেট ইরর থাকলে দেখা যাবে।

### 6. Recent Deployment
```bash
cd /opt/hybrid && git log --oneline -3
```
সর্বশেষ কমিট production-এ আছে কিনা নিশ্চিত করো।

## সমস্যা হলে

- **Container down:** `docker compose -f docker-compose.prod.yml restart <service>`
- **Deploy stuck:** `cd /opt/hybrid && ./deploy.sh`
- **DB unreachable:** Supabase Studio চেক করো
