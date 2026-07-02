# Hybrid web app — production image (monorepo build).
# Builds all @hybrid/* packages via turbo, then runs `next start`.
FROM node:20-bookworm-slim

# pnpm via corepack (version pinned by root package.json "packageManager")
RUN corepack enable
WORKDIR /app

# Copy the whole monorepo (node_modules/.next/.git excluded via .dockerignore)
COPY . .

# Fresh install (lockfile may predate the Wave-0 deps on a clean checkout)
RUN pnpm install --no-frozen-lockfile

# Build-time env. NEXT_PUBLIC_* is inlined at build; the rest satisfy
# module-load-time reads (postgres client, crypto key) during `next build`.
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG DATABASE_URL
ARG DIRECT_URL
ARG APP_ENCRYPTION_KEY
ARG DEV_SESSION_SECRET
ARG SESSION_SECRET
ARG REDIS_URL
ARG CRON_SECRET
ENV NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    DATABASE_URL=$DATABASE_URL \
    DIRECT_URL=$DIRECT_URL \
    APP_ENCRYPTION_KEY=$APP_ENCRYPTION_KEY \
    DEV_SESSION_SECRET=$DEV_SESSION_SECRET \
    SESSION_SECRET=$SESSION_SECRET \
    REDIS_URL=$REDIS_URL \
    CRON_SECRET=$CRON_SECRET \
    NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=4096

RUN pnpm build

WORKDIR /app/apps/web
EXPOSE 3000
# Pre-flight check runs first; exits non-zero if env/DNS/GoTrue are broken.
# See apps/web/scripts/preflight.mjs for what it checks and why.
CMD ["sh", "-c", "node scripts/preflight.mjs && pnpm start"]
