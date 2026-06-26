"use client";

// Browser-side Supabase client for OAuth flows.
//
// Server-side auth (lib/auth/supabaseAuth.ts) talks to the internal Docker
// network gateway (http://supabase-kong:8000) because the app verifies
// passwords against GoTrue during login. That URL is NOT reachable from a
// browser — it lives on the private Docker network.
//
// For OAuth, the browser calls GoTrue's public HTTPS endpoint directly
// (https://supabase.<root>/auth/v1/...). That URL is reachable from the
// browser AND is safe to expose via NEXT_PUBLIC_ env vars (the anon JWT
// is meant to be public — same model as every Supabase web app).
//
// Auth surface:
//   signInWithOAuth({ provider, options: { redirectTo } })
//     → opens GoTrue hosted UI → provider consent → redirect to /auth/callback
//     with ?code=...  → our Server Route exchanges it + mints hybrid_session.
//
// If NEXT_PUBLIC_SUPABASE_URL is unset (e.g. local dev with AUTH_PROVIDER=*** or password), `supabaseBrowserClient()` returns null and callers must
// render a "OAuth not configured" message. We never hardcode a public URL —
// the deployment decides.
//
// We use `createClient` from @supabase/supabase-js (already a dep — OAuth
// does its own redirect dance, no SSR cookie sync needed). The SSR-specific
// createBrowserClient helper from @supabase/ssr would be nicer for cookie
// sessions, but OAuth's PKCE flow doesn't need it.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function supabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    cached = null;
    return null;
  }
  cached = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

