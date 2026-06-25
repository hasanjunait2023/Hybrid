"use client";

import { useState, type FormEvent } from "react";

interface LoginLabels {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  invalidCredentials: string;
  genericError: string;
}

// Email + password login form. Posts JSON to /api/auth/login (same-origin, so the
// CSRF Origin check passes). On success the API sets the session cookie on the
// parent domain; we hard-navigate to "/" so the host (admin.* / app.*) routes to
// the right app shell. Errors collapse to the single generic Bengali message the
// API returns (no field-level disclosure). Labels are resolved server-side and
// passed in so the form follows the active locale without a client provider.
export function LoginForm({ labels }: { labels: LoginLabels }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
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
  );
}
