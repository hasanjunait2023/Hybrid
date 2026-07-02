"use client";

import { useState } from "react";

/** OAuth start shim. Lives on admin.{ROOT}/oauth/start and simply redirects the
 * user into Supabase signInWithOAuth from a Google-registered origin. */
export default function OAuthStartPage() {
  const [error] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    const next = params.get("next") ?? "/";

    if (provider !== "google" && provider !== "facebook") {
      return "Invalid provider";
    }

    import("@/lib/auth/supabaseBrowser").then(({ supabaseBrowserClient }) => {
      const supabase = supabaseBrowserClient();
      if (!supabase) {
        window.location.replace(`/login?oauth_error=${encodeURIComponent("OAuth not configured")}`);
        return;
      }
      supabase.auth
        .signInWithOAuth({
          provider,
          options: { redirectTo: oauthCallbackUrl(next) },
        })
        .then(({ error: oauthErr }) => {
          if (oauthErr) {
            window.location.replace(`/login?oauth_error=${encodeURIComponent(oauthErr.message)}`);
          }
        })
        .catch((err: unknown) => {
          window.location.replace(
            `/login?oauth_error=${encodeURIComponent(err instanceof Error ? err.message : "OAuth failed")}`,
          );
        });
    });
    return null;
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="text-center">
        <p className="text-ink-muted">{error ?? "Redirecting to sign-in..."}</p>
      </div>
    </main>
  );
}

function oauthCallbackUrl(next: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hybrid.ecomex.cloud";
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const u = new URL("/auth/callback", window.location.origin);
    u.searchParams.set("next", next);
    return u.toString();
  }
  const u = new URL("/auth/callback", `https://admin.${root}`);
  u.searchParams.set("next", next);
  return u.toString();
}
