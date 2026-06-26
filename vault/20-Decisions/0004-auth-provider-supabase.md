---
type: adr
status: accepted
date: 2026-06-25
---

# 0004 — Auth = Supabase GoTrue + app opaque session

**Status:** accepted

## Context
Need a credential authority on the self-hosted stack without per-request network calls to GoTrue
on every authenticated page.

## Decision
`AUTH_PROVIDER=supabase`. GoTrue is the credential authority (users in `auth.users`, Studio-managed).
Login verifies email+password against GoTrue, maps to `app_user` **by email**, then mints the app's
own opaque `hybrid_session` (same session layer as the `password` provider). `password` (own auth,
Argon2id) remains a working fallback.

## Consequences
- Passwords are bcrypt-hashed in GoTrue — **not retrievable**; reset via GoTrue admin API / Studio.
- OAuth funnels through `/auth/callback` → `mintSessionFromSupabase`. Account-takeover guard required
  → [[vault/10-Features/security-oauth-fix]].
- Super-admin = `is_platform_admin` on `app_user`.

## Links
[[CLAUDE]] "Auth seam" · `apps/web/lib/auth/`
