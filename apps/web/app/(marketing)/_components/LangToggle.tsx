"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Locale } from "../../../lib/i18n/marketing";

const LANG_COOKIE = "hybrid_lang";
const ONE_YEAR = 60 * 60 * 24 * 365;

interface LangToggleProps {
  /** Currently active locale (resolved server-side). */
  locale: Locale;
  /** Label of the language you switch TO (e.g. "EN" when active is bn). */
  toLabel: string;
  ariaLabel: string;
}

// Sets the hybrid_lang cookie to the OTHER locale and refreshes the server
// components so the page re-renders in the new language. No client-side string
// store — the dictionary lives server-side; this only flips the cookie.
export function LangToggle({ locale, toLabel, ariaLabel }: LangToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next: Locale = locale === "bn" ? "en" : "bn";

  function handleToggle() {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={ariaLabel}
      disabled={isPending}
      className="inline-flex h-9 min-w-[3.25rem] items-center justify-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors duration-fast ease-out-soft hover:bg-surface-2 disabled:opacity-60"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-4 w-4 text-ink-subtle"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      <span className="font-latin">{toLabel}</span>
    </button>
  );
}
