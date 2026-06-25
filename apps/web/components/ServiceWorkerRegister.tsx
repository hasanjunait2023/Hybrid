"use client";

import { useEffect } from "react";

// Service worker registration. Renders nothing. Mounts once from the root
// layout (after the CookieConsent banner). The SW only registers in
// production — dev builds would constantly invalidate the cache and
// confuse HMR.

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Service worker failures must never break the app — just log.
          console.warn("[sw] register failed:", err);
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}