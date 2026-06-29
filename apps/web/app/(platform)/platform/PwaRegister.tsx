"use client";

import { useEffect } from "react";

// Registers the existing /sw.js (scope "/") so the console is an installable,
// offline-capable PWA. The app shipped a manifest + sw.js but never registered
// it — this closes the loop. On the app host, the manifest start_url "/" maps to
// the platform dashboard, so "Add to Home Screen" installs the admin console.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal — the app still works online */
      });
    }
  }, []);
  return null;
}
