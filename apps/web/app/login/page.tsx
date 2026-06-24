import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

// Email + password login (AUTH_PROVIDER=supabase: credentials verified against
// Supabase Auth / GoTrue). Reached on admin.* and app.* hosts — the middleware
// passes /login through untouched so it resolves as this top-level route. The
// dev-login route redirects here whenever AUTH_PROVIDER is not "dev".
export const metadata: Metadata = { title: "লগ ইন — Hybrid" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4" lang="bn">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-ink">Hybrid</h1>
        <p className="mb-6 text-sm text-ink-muted">আপনার অ্যাকাউন্টে লগ ইন করুন।</p>
        <LoginForm />
      </div>
    </main>
  );
}
