import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Create a server-side Supabase client for the OAuth callback route.
 *  Reads the PKCE code verifier from the incoming request cookies so the
 *  code exchange can complete, and writes any auth cookies to the response. */
export async function createOAuthCallbackClient(
  request: NextRequest,
  response: NextResponse,
) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not set");
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll: () => {
        return request.cookies.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll: (cookiesToSet) => {
        // Mutate request cookies so subsequent reads in this request see updates.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        // Write back to the response so the browser state stays consistent.
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      flowType: "pkce",
    },
  });
}
