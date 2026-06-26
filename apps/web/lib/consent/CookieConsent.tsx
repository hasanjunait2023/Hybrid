"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import {
  acceptAll,
  acceptEssentialOnly,
  readConsent,
} from "./consent";

// Cookie consent banner. Renders only on the client (no SSR) so the
// localStorage read never runs on the server. Visually: fixed bottom-left
// card on desktop, full-width bottom sheet on mobile. Always dismissable
// by clicking the privacy policy link (which also records the choice so the
// banner stays gone).
//
// The banner auto-hides once a consent decision exists. To re-prompt (e.g.
// after policy update), bump CONSENT_VERSION in `./consent.ts` — readConsent
// returns null for stale versions and the banner reappears.

export function CookieConsent() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const existing = readConsent();
    if (!existing) setVisible(true);
  }, []);

  if (!mounted || !visible) return null;

  const c = t.common.cookie;

  function handle(choice: () => void) {
    choice();
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={c.title}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl rounded-t-2xl border border-zinc-800 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur sm:bottom-4 sm:left-1/2 sm:right-auto sm:max-w-md sm:-translate-x-1/2 sm:rounded-2xl"
    >
      <h2 className="text-base font-semibold text-zinc-50">{c.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{c.body}</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/privacy"
          className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          onClick={() => handle(acceptEssentialOnly)}
        >
          {c.policy}
        </Link>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handle(acceptEssentialOnly)}
            className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 sm:flex-none"
          >
            {c.essential}
          </button>
          <button
            type="button"
            onClick={() => handle(acceptAll)}
            className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 sm:flex-none"
          >
            {c.accept}
          </button>
        </div>
      </div>
    </div>
  );
}