# Hybrid — Google OAuth Setup Guide (`.ecomex.cloud` only)

This guide wires Google sign-in for the Hybrid platform on the
`.ecomex.cloud` domain stack. **Nothing here touches `junno.qzz.io`.**

## What we already did on the VPS

1. Supabase GoTrue auth service configured to accept Google OAuth:
   - File: `/data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env`
   - File: `/data/coolify/services/pe9o2li2n3bns3wnofob49uw/docker-compose.yml`
2. Hybrid app web container will receive public Supabase env vars via
   `/root/hybrid.env`:
   - `NEXT_PUBLIC_SUPABASE_URL=https://supabase.ecomex.cloud`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT>`
3. Hybrid login page already has a "Continue with Google" button.

## What YOU must do in Google Cloud Console

### 1. Create / pick a Google Cloud project
- URL: https://console.cloud.google.com/
- Use a project you control (e.g. `ecomex-hybrid-prod`).

### 2. Configure the OAuth consent screen
- Go to **APIs & Services → OAuth consent screen**
- Choose **External** (so any user can sign in)
- Fill in:
  - App name: `Hybrid` (or your brand name)
  - User support email: your email
  - Authorized domains: `ecomex.cloud`
  - Developer contact email: your email
- **Scopes**: add at minimum
  - `.../auth/userinfo.email`
  - `.../auth/userinfo.profile`
  - `openid`
- Save and continue through the test-user step.

### 3. Create OAuth 2.0 credentials
- Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
- Application type: **Web application**
- Name: `Hybrid Supabase Auth`
- **Authorized JavaScript origins**:
  - `https://admin.hybrid.ecomex.cloud`
  - `https://app.hybrid.ecomex.cloud`
  - `https://*.hybrid.ecomex.cloud`
- **Authorized redirect URIs**:
  - `https://supabase.ecomex.cloud/auth/v1/callback`

> ⚠️ Google does **not** allow wildcard redirect URIs. The single Supabase
> callback URL is the correct pattern because Supabase GoTrue handles all
> provider redirects and then forwards back to your app.

### 4. Copy Client ID and Secret
- Click **Download JSON** or copy the values.
- You need:
  - Client ID
  - Client Secret

## How to apply the credentials

SSH into the VPS and edit the Supabase `.env`:

```bash
ssh mt5vps
nano /data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env
```

Replace the empty Google OAuth lines:

```bash
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=< paste client id here >
GOTRUE_EXTERNAL_GOOGLE_SECRET=< paste client secret here >
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.ecomex.cloud/auth/v1/callback
```

Save, then restart the Supabase auth container:

```bash
cd /data/coolify/services/pe9o2li2n3bns3wnofob49uw
docker compose up -d --force-recreate supabase-auth
```

Then redeploy Hybrid web (so the public Supabase env vars are picked up):

```bash
cd /opt/hybrid
bash deploy.sh
```

## Verify the flow

1. Open `https://admin.hybrid.ecomex.cloud/login`
2. Click **Continue with Google**
3. You should be redirected to Google consent, then back to
   `https://supabase.ecomex.cloud/auth/v1/callback`, then finally to
   `https://admin.hybrid.ecomex.cloud/auth/callback?next=/admin`
4. You land on `/admin` logged in.

## Security notes

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe in browser JS; it is a public anon
  token by design.
- `SUPABASE_SERVICE_ROLE_KEY` stays server-only and is already configured.
- The Google OAuth `Client Secret` lives only in the Supabase `.env` file,
  never in Hybrid source code or browser bundles.
- Hybrid app mints its own opaque `hybrid_session` cookie after the OAuth
  callback, so the Google token is not used for session state.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "OAuth provider not configured" button disabled | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing in `/root/hybrid.env` or not passed to web container |
| Google error: redirect_uri_mismatch | Add exactly `https://supabase.ecomex.cloud/auth/v1/callback` in Google Console credentials |
| "Error getting user email from external provider" | Make sure Google Console scopes include `userinfo.email` and `userinfo.profile` |
| Final redirect fails / 400 from `/auth/callback` | Check `ADDITIONAL_REDIRECT_URLS` includes `https://admin.hybrid.ecomex.cloud/auth/callback` and `https://*.hybrid.ecomex.cloud/auth/callback` |

## Files changed by this setup

- `/data/coolify/services/pe9o2li2n3bns3wnofob49uw/.env`
- `/data/coolify/services/pe9o2li2n3bns3wnofob49uw/docker-compose.yml`
- `/root/hybrid.env`
- `/root/Hybrid/.env.example`
- `/root/Hybrid/infra/oauth/google/README.md`
