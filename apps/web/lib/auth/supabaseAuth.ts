// Supabase Auth (GoTrue) as the credential authority (AUTH_PROVIDER=supabase).
//
// Identities live in Supabase `auth.users` (manageable in Studio); login
// verifies the password against GoTrue via signInWithPassword. The app then
// mints its OWN opaque DB-backed session (lib/auth/session.ts) keyed to the
// matching app_user — so the robust session/CSRF/rate-limit layer is reused and
// there is no per-request network call to GoTrue on authenticated pages.
//
// SUPABASE_URL is the internal Kong gateway (http://supabase-kong:8000) on the
// Docker network — auth never needs to be exposed publicly for this flow.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (required for AUTH_PROVIDER=supabase)`);
  return v;
}

const NO_PERSIST = { auth: { persistSession: false, autoRefreshToken: false } } as const;

// Test seam. The two factories below normally build a real GoTrue client via
// @supabase/supabase-js. A test can inject a fake (same surface) so the login /
// signup paths are exercisable without a live GoTrue server. Default is
// undefined → real behavior unchanged; production never touches this.
let authClientFactory: (() => SupabaseClient) | undefined;
let adminClientFactory: (() => SupabaseClient) | undefined;

// Override BOTH client factories with a fake (test-only). Pass undefined to
// reset to the real clients. Kept out of the request paths so production is
// identical to before this seam existed.
export function __setSupabaseClientFactoriesForTest(
  factories: { auth?: () => SupabaseClient; admin?: () => SupabaseClient } | undefined,
): void {
  authClientFactory = factories?.auth;
  adminClientFactory = factories?.admin;
}

// Anon client — one-shot password verification (signInWithPassword).
export function supabaseAuthClient(): SupabaseClient {
  if (authClientFactory) return authClientFactory();
  return createClient(need("SUPABASE_URL"), need("SUPABASE_ANON_KEY"), NO_PERSIST);
}

// Service-role client — admin user management (create users at signup).
export function supabaseAdminClient(): SupabaseClient {
  if (adminClientFactory) return adminClientFactory();
  return createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), NO_PERSIST);
}

// Verify an email/password pair against GoTrue. Returns true only on a valid,
// confirmed credential. Never throws to the caller (network/credential failures
// collapse to false so the route returns a single generic error).
export async function verifySupabaseCredentials(email: string, password: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAuthClient().auth.signInWithPassword({ email, password });
    return !error && !!data?.user;
  } catch {
    return false;
  }
}
