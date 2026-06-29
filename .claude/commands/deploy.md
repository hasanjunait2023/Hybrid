# deploy

Production VPS-এ Hybrid অ্যাপ ডিপ্লয় করো।

## Steps

1. **Local build verify করো** — TypeScript ও ESLint পাস হচ্ছে কিনা চেক করো:
   ```bash
   pnpm typecheck && pnpm lint
   ```

2. **Current branch ও uncommitted changes চেক করো:**
   ```bash
   git status
   git log --oneline -5
   ```

3. **Master branch-এ আছো কিনা নিশ্চিত করো** — production সবসময় `master` থেকে ডিপ্লয় হয়।

4. **GitHub-এ push করো:**
   ```bash
   git push -u origin master
   ```

5. **CI status চেক করো** — `.github/workflows/ci.yml` রান হচ্ছে কিনা GitHub MCP দিয়ে দেখো।

6. **VPS-এ SSH করে deploy.sh রান করো:**
   - Host: `72.62.228.196` (alias: `mt5vps`)
   - Path: `/opt/hybrid`
   - Command: `cd /opt/hybrid && ./deploy.sh`

7. **Health check করো:**
   - `https://hybrid.ecomex.cloud` — marketing page লোড হচ্ছে কিনা
   - `https://app.hybrid.ecomex.cloud/platform` — platform admin আসছে কিনা

8. **Docker service স্ট্যাটাস:**
   ```bash
   docker ps --filter name=hybrid
   ```

## Production Stack
- Docker Compose: `docker-compose.prod.yml`
- Reverse proxy: Caddy (`hybrid-web`)
- Cache: `hybrid-redis`
- DB: `supabase-db` (self-hosted Supabase on VPS)

## Rollback
কোনো সমস্যা হলে:
```bash
cd /opt/hybrid && git checkout <previous-commit> && ./deploy.sh
```
