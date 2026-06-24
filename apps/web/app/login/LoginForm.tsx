"use client";

import { useState, type FormEvent } from "react";

// Email + password login form. Posts JSON to /api/auth/login (same-origin, so the
// CSRF Origin check passes). On success the API sets the session cookie on the
// parent domain; we hard-navigate to "/" so the host (admin.* / app.*) routes to
// the right app shell. Errors collapse to the single generic Bengali message the
// API returns (no field-level disclosure).
export function LoginForm() {
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
      setError(data.error ?? "ইমেইল বা পাসওয়ার্ড সঠিক নয়।");
    } catch {
      setError("দুঃখিত, কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">ইমেইল</span>
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
        <span className="text-sm font-medium text-ink">পাসওয়ার্ড</span>
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
        {pending ? "লগ ইন হচ্ছে…" : "লগ ইন"}
      </button>
    </form>
  );
}
