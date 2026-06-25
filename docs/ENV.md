# ENV — environment variable keys (NO values)

> Source of truth with local defaults: [.env.example](../.env.example). Real secrets live only
> in `.env.local` (gitignored) and the VPS environment. Never commit values.

## Core
| Key | Purpose |
|---|---|
| `DATABASE_URL` | Runtime DB conn as `app_runtime_login` (RLS forced) |
| `DIRECT_URL` | Superuser conn as `postgres` (migrations, seed, type gen, `asPlatformAdmin`) |
| `REDIS_URL` | Redis cache (`hybrid-redis`) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for subdomain → tenant routing |
| `APP_ENCRYPTION_KEY` | AES-256-GCM key sealing gateway/courier credentials |

## Auth
| Key | Purpose |
|---|---|
| `AUTH_PROVIDER` | `supabase` (prod default) \| `password` (own-auth fallback) \| dev-login default |
| `DEV_SESSION_SECRET` | HMAC key for dev-login cookie (dev only, prod-gated) |
| `SESSION_SECRET` | Signs opaque session token (password/supabase branch); 32+ bytes |
| `SESSION_MAX_AGE_SECONDS` | Session lifetime (default 604800) |
| `SUPABASE_URL` | Internal Kong URL (`http://supabase-kong:8000`) |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (admin user create, GoTrue verify) |

## Storage / media
| Key | Purpose |
|---|---|
| `BLOB_DRIVER` | `s3` (Supabase MinIO, prod) \| local (Phase 1) |

## SMS
| Key | Purpose |
|---|---|
| `SMS_LIVE` | Gate for live SMS sending (sms.net.bd) |
| `SMS_API_KEY` | sms.net.bd API key |
| `SMS_SENDER_ID` | Approved sender ID (masking) |

## Internal / cron
| Key | Purpose |
|---|---|
| `CRON_SECRET` | Bearer guard for `/api/internal/*` (billing-sweep, courier-sync, tls-allow) |

## Feature flags / integrations
| Key | Purpose |
|---|---|
| `WHATSAPP_ENABLED` | WhatsApp notifications toggle |
| `CAPI_ENABLED` | Meta Conversions API toggle |
| `VERCEL_DOMAINS_ENABLED` | Custom-domain provisioning via Vercel Domains API toggle |
| `VERCEL_API_TOKEN` | Vercel API token (custom domains) |
| `VERCEL_PROJECT_ID` | Vercel project id (custom domains) |
| `VERCEL_TEAM_ID` | Vercel team id (custom domains) |
| `VERCEL_CNAME_TARGET` | CNAME target for tenant custom domains |

> Fail-fast: prod-required secrets (session, encryption, Supabase keys) must be present at
> startup or the app refuses to boot.
