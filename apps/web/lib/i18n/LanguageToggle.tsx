"use client";

// Universal language toggle. Flips the hybrid_lang cookie to the other locale
// and refreshes server components so the whole page re-renders in the new
// language (SSR, no hydration flash). Needs a <LocaleProvider> ancestor.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@hybrid/ui";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, otherLocale } from "./config";
import { useDict, useLocale } from "./provider";

export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const d = useDict();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next = otherLocale(locale);

  function handleToggle() {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={d.common.lang.ariaLabel}
      disabled={isPending}
      className={cn(
        "inline-flex h-9 min-w-[3rem] items-center justify-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60",
        className,
      )}
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
      <span>{d.common.lang.toggleTo}</span>
    </button>
  );
}
