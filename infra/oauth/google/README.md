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

### Supabase GoTrue environment

File on VPS:
`/data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env`

Required keys (fill in the two empty values):

```env
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=YOUR_CLIENT_SECRET
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
3. We hard-navigate to `https://admin.hybrid.ecomex.cloud/oauth/start?provider=google&next=/`.
4. The start page calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "https://admin.hybrid.ecomex.cloud/auth/callback?next=/" } })` from the registered origin.
5. Google approves the origin, redirects to Supabase at `https://supabase.ecomex.cloud/auth/v1/callback`.
6. Supabase GoTrue redirects to `https://admin.hybrid.ecomex.cloud/auth/callback?code=...&next=/`.
7. `/auth/callback` mints the `hybrid_session` cookie and redirects to `next`.

## Pages with Google auth UI

| Page | File | Button text |
|------|------|-------------|
| Universal login | `apps/web/app/login/LoginForm.tsx` | Continue with Google / Facebook |
| Signup (apex) | `apps/web/app/(marketing)/signup/SignupForm.tsx` | Continue with Google / Facebook |
| OAuth start shim | `apps/web/app/oauth/start/page.tsx` | Redirecting to sign-in… |
| OAuth callback | `apps/web/app/auth/callback/route.ts` | (no UI; mints cookie) |

## Notes

- `NEXT_PUBLIC_SUPABASE_URL` must be set to `https://supabase.ecomex.cloud` in the
  public env so the browser client talks to the public GoTrue endpoint.
- `oauthStartUrl()` and `oauthCallbackUrl()` in `apps/web/lib/auth/oauthStartUrl.ts`
  centralize the fixed origin logic. In non-production builds they fall back to
  the current origin so local dev still works.
- The existing marketplace login (`market/login`) uses a separate, simpler form. If
  you want Google there too, the same `oauthStartUrl()` helper can be dropped in.

## Verification pages

Google Search Console verification tag is live on `.ecomex.cloud` hosts only:

- `/privacy` and `/terms` pages exist.
- Meta tag: `google-site-verification=jfegcQr5aSi9_cxMZ7rCq3teT3f2iWN0FzPAz8xez98`
- `junno.qzz.io` is not touched.
