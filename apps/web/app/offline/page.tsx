// Offline fallback. Shown by the service worker when navigation fails AND
// no cached page matches the request. Server-rendered so crawlers can index
// it too — though it's not normally indexed since /offline is noindex.

export const metadata = {
  title: "Offline — Hybrid",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-ink">
      <h1 className="text-3xl font-bold">You&apos;re offline</h1>
      <p className="mt-3 max-w-md text-center text-ink-muted">
        We couldn&apos;t reach Hybrid. Check your internet connection and try again.
        Cached pages you&apos;ve visited recently will still work.
      </p>
      <a
        href="/"
        className="mt-6 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-ink-on-primary hover:bg-primary-hover"
      >
        Retry
      </a>
    </main>
  );
}