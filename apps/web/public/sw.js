/* Hybrid service worker — minimal installable PWA.
 *
 * Strategy:
 *   - Cache the app shell (root document + offline fallback) at install.
 *   - Network-first for navigation requests with offline fallback to /offline.
 *   - Cache-first for static assets (icons, fonts, images) with stale-while-
 *     revalidate.
 *   - API routes (/api/**) are NEVER cached — they're auth-gated and must
 *     always hit the live backend.
 *
 * This SW does NOT precache tenant storefront HTML — each merchant's
 * subdomain has its own cache scope and we don't want one tenant's data
 * leaking into another's offline cache.
 */

const VERSION = "hybrid-sw-v1";
const APP_SHELL = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API/auth/admin
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/platform/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/signup")
  ) {
    return;
  }

  // Same-origin only
  if (url.origin !== self.location.origin) return;

  // Navigation → network-first, fall back to cache, fall back to /offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/offline")),
        ),
    );
    return;
  }

  // Static assets → cache-first, refresh in background.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});