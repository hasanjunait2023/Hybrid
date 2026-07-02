# Google OAuth for .ecomex.cloud

## TL;DR

OAuth UI is now wired. Google Cloud Console only needs **exact** Authorized
JavaScript origins; wildcards like `https://*.hybrid.ecomex.cloud` are rejected.
To fix this, all OAuth (Google/Facebook) starts on the fixed host
`admin.hybrid.ecomex.cloud` regardless of which tenant subdomain the user is on.

## Console configuration

### Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 client

**Authorized JavaScript origins (must be exact — no wildcards):**

```text
https://hybrid.ecomex.cloud
https://admin.hybrid.ecomex.cloud
https://app.hybrid.ecomex.cloud
```

**Authorized redirect URI (one exact URI):**

```text
https://supabase.ecomex.cloud/auth/v1/callback
```

> ⚠️ The downloaded `client_secret_*.json` currently lists `redirect_uris` as
> `https://whatapp.ecomex.cloud`. That is **wrong** for this setup. You must
> open Google Cloud Console and change the redirect URI to the value above.
> The Supabase GoTrue `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` env var already
> points to `https://supabase.ecomex.cloud/auth/v1/callback`; the Console must
> match it exactly.

### Supabase GoTrue environment

File on VPS:
`/data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env`

Required keys (already set; the two secret values came from the JSON you
uploaded):

```env
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=510336060774-4sp2p9mbdnot81gfid29gkpapet3ulo7.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=***set-on-vps***
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.ecomex.cloud/auth/v1/callback

# Allow the fixed callback host + the app/admin/tenant hosts to be used as
# final redirect targets. Wildcards are OK here (Supabase is doing the check,
# not Google).
GOTRUE_URI_ALLOW_LIST=https://admin.hybrid.ecomex.cloud/**,https://app.hybrid.ecomex.cloud/**,https://*.hybrid.ecomex.cloud/**
ADDITIONAL_REDIRECT_URLS=https://admin.hybrid.ecomex.cloud/auth/callback,https://app.hybrid.ecomex.cloud/auth/callback,https://*.hybrid.ecomex.cloud/auth/callback
```

After editing the env file, restart the auth container:

```bash
ssh mt5vps 'cd /data/coolify/services/pe9o2li2n3bns3wnofob49uw && docker compose restart supabase-auth'
```

## User flow

1. User is on any tenant admin host, e.g. `https://admin.shop.hybrid.ecomex.cloud/login`.
2. They click **Continue with Google**.
3. We hard-navigate to `https://admin.hybrid.ecomex.cloud/oauth/start?provider=google&next=https://admin.shop.hybrid.ecomex.cloud/`.
4. The start page calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "https://admin.hybrid.ecomex.cloud/auth/callback?next=https://admin.shop.hybrid.ecomex.cloud/" } })` from the registered origin.
5. Google approves the origin, redirects to Supabase at `https://supabase.ecomex.cloud/auth/v1/callback`.
6. Supabase GoTrue redirects to `https://admin.hybrid.ecomex.cloud/auth/callback?code=...&next=https://admin.shop.hybrid.ecomex.cloud/`.
7. `/auth/callback` mints the `hybrid_session` cookie on domain `.hybrid.ecomex.cloud` and redirects to the original tenant host.

## Pages with Google auth UI

| Page | File | Button text |
|------|------|-------------|
| Universal login | `apps/web/app/login/LoginForm.tsx` | Continue with Google / Facebook |
| Signup (apex) | `apps/web/app/(marketing)/signup/SignupForm.tsx` | Continue with Google / Facebook |
| OAuth start shim | `apps/web/app/oauth/start/page.tsx` | Redirecting to sign-in… |
| OAuth callback | `apps/web/app/auth/callback/route.ts` | (no UI; mints cookie) |

## Security notes

- `oauthStartUrl()` always returns an absolute `https://admin.{ROOT}/oauth/start` URL in production.
- `defaultPostLoginNext()` returns an absolute URL to the original host so the user lands back on their tenant/app/market host after OAuth.
- `/auth/callback` validates the `next` URL with `isAllowedPostLoginUrl()` to prevent open redirects.
- The session cookie is set on `.hybrid.ecomex.cloud`, so it is readable across all `admin.*`, `app.*`, and `market.*` subdomains.

## Verification pages

Google Search Console verification tag is live on `.ecomex.cloud` hosts only:

- `/privacy` and `/terms` pages exist.
- Meta tag: `google-site-verification=jfegcQr5aSi9_cxMZ7rCq3teT3f2iWN0FzPAz8xez98`
- `junno.qzz.io` is not touched.

## Remaining manual step

Only **you** can do this from the Google Cloud Console web UI:

1. Open https://console.cloud.google.com/apis/credentials
2. Find the **ecomex-501208** project OAuth 2.0 client.
3. Under **Authorized redirect URIs**, replace `https://whatapp.ecomex.cloud` with:
   `https://supabase.ecomex.cloud/auth/v1/callback`
4. Under **Authorized JavaScript origins**, add the three exact origins listed above.
5. Save.

After that, Google sign-in will work end-to-end.
