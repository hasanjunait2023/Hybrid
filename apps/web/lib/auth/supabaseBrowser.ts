"use client";

// Browser-side Supabase client for OAuth flows.
// Uses @supabase/ssr createBrowserClient so PKCE code verifier is stored in
// cookies instead of localStorage, making it available to the server-side
// /auth/callback route for the code exchange.
//
// If NEXT_PUBLIC_SUPABASE_URL is unset, `supabaseBrowserClient()` returns null
// and callers render an "OAuth not configured" message.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function supabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    cached = null;
    return null;
  }
  cached = createBrowserClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      flowType: "pkce",
    },
  });
  return cached;
}
