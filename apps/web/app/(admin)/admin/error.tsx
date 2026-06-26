"use client";

import { useEffect } from "react";
import Link from "next/link";

// Admin error boundary — must be a Client Component per Next.js requirements.
// Catches render errors in any (admin) child segment. Shows a calm, retryable
// message in Bengali or English, never leaks stack traces to the user.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side errors carry a digest for log correlation; surface to console
    // so the developer (or our Sentry/GlitchTip sink if wired) can pick it up.
    console.error("[admin] segment crashed:", error.digest ?? error.message);
  }, [error]);

  // Cheap locale sniff: <html lang> set by LocaleProvider in the layout.
  // We can't import i18n here (this is a client component, and the dict loader
  // is server-only), so we read from the document.
  const isBn =
    typeof document !== "undefined" && document.documentElement.lang === "bn";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-cod-soft text-2xl font-bold text-cod">
        !
      </div>

      <h1 className="text-xl font-bold text-ink">
        {isBn ? "কিছু একটা সমস্যা হয়েছে" : "Something went wrong"}
      </h1>

      <p className="mt-2 text-sm text-ink-muted">
        {isBn
          ? "এই পেজে একটি ত্রুটি হয়েছে। আবার চেষ্টা করুন, অথবা ড্যাশবোর্ডে ফিরে যান।"
          : "An error occurred while loading this page. Try again, or head back to the dashboard."}
      </p>

      {error.digest ? (
        <p className="mt-3 font-mono text-[11px] text-ink-subtle">
          ref: {error.digest}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
        >
          {isBn ? "আবার চেষ্টা করুন" : "Try again"}
        </button>
        <Link
          href="/admin"
          className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2"
        >
          {isBn ? "ড্যাশবোর্ডে ফিরে যান" : "Back to dashboard"}
        </Link>
      </div>
    </div>
  );
}