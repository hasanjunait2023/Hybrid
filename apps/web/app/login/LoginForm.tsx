"use client";

import { useState, type FormEvent } from "react";
import { oauthStartUrl, defaultPostLoginNext } from "@/lib/auth/oauthStartUrl";

interface LoginLabels {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  invalidCredentials: string;
  genericError: string;
  divider: string;
  oauthGoogle: string;
  oauthFacebook: string;
  oauthFailed: string;
}

type OAuthProvider = "google" | "facebook";

interface LoginFormProps {
  labels: LoginLabels;
  /** Where to send the user after a successful OAuth login. Defaults to host-aware path. */
  next?: string;
}

// Email + password login form. Posts JSON to /api/auth/login (same-origin, so the
// CSRF Origin check passes). On success the API sets the session cookie on the
// parent domain; we hard-navigate to "/" so the host (admin.* / app.*) routes to
// the right app shell. Errors collapse to the single generic Bengali message the
// API returns (no field-level disclosure). Labels are resolved server-side and
// passed in so the form follows the active locale without a client provider.
//
// The OAuth buttons sit ABOVE the password form. They hard-navigate to a fixed
// OAuth start page on admin.{ROOT} because Google Cloud Console forbids
// wildcard Authorized JavaScript origins (https://*.hybrid.ecomex.cloud is
// rejected). The start page calls Supabase GoTrue from the registered origin,
// then Google → Supabase → /auth/callback mints the hybrid_session cookie.
export function LoginForm({ labels, next }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);

  // Surface ?oauth_error=<msg> that /auth/callback sets on failure.
  const [oauthErrorFromCallback] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    const e = p.get("oauth_error");
    if (e) {
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth_error");
      window.history.replaceState({}, "", url.toString());
    }
    return e;
  });

  const postLoginNext =
    next ??
    (typeof window !== "undefined"
      ? defaultPostLoginNext(window.location.host)
      : "/");

  function startOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthPending(provider);
    // Hard-navigate to the fixed OAuth start host. This is the only reliable way
    // to satisfy Google's exact-origin requirement across all tenant subdomains.
    window.location.assign(oauthStartUrl(provider, postLoginNext));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        window.location.assign("/");
        return;
      }
      setError(data.error ?? labels.invalidCredentials);
    } catch {
      setError(labels.genericError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* OAuth — primary path on mobile (no typing) */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => startOAuth("google")}
          disabled={oauthPending !== null}
          className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-ink hover:bg-bg disabled:opacity-60"
          aria-label={labels.oauthGoogle}
        >
          <GoogleG size={18} />
          {oauthPending === "google" ? labels.submitting : labels.oauthGoogle}
        </button>
        <button
          type="button"
          onClick={() => startOAuth("facebook")}
          disabled={oauthPending !== null}
          className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-ink hover:bg-bg disabled:opacity-60"
          aria-label={labels.oauthFacebook}
        >
          <FacebookF size={18} />
          {oauthPending === "facebook" ? labels.submitting : labels.oauthFacebook}
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
        <span className="h-px flex-1 bg-border" />
        <span>{labels.divider}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Email + password — fallback path */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{labels.email}</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-md border border-border bg-surface px-3 text-ink outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{labels.password}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-md border border-border bg-surface px-3 text-ink outline-none focus:border-primary"
          />
        </label>

        {(error || oauthErrorFromCallback) && (
          <p role="alert" className="text-sm text-danger">
            {error ?? oauthErrorFromCallback}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-md bg-primary px-4 font-semibold text-white disabled:opacity-60"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </form>
    </div>
  );
}

// Inline brand glyphs (single-color, monochrome — no external image fetch).
// Kept tiny so the buttons work offline / on slow BD networks.
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107" // eslint-disable-line hybrid/no-hardcoded-color
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00" // eslint-disable-line hybrid/no-hardcoded-color
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z"
      />
      <path
        fill="#4CAF50" // eslint-disable-line hybrid/no-hardcoded-color
        d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-4.9c-1.9 1.4-4.3 2.2-6.9 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.1 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2" // eslint-disable-line hybrid/no-hardcoded-color
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.4 5.5l6 4.9c-.4.4 6.5-4.7 6.5-14.4 0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function FacebookF({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2" // eslint-disable-line hybrid/no-hardcoded-color
        d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z"
      />
    </svg>
  );
}
