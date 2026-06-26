// Admin skeleton — shown while server components are streaming.
// Mirrors the layout (left sidebar + top bar) so layout doesn't shift on
// navigation. Uses design tokens so it blends with the actual dashboard.

export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {/* Page header skeleton */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-44 animate-pulse rounded-md bg-surface-2" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-surface-2" />
        </div>
        <div className="hidden h-11 w-32 animate-pulse rounded-md bg-surface-2 sm:block" />
      </div>

      {/* Search + filter pills row */}
      <div className="flex gap-2 overflow-hidden">
        <div className="h-11 flex-1 animate-pulse rounded-md bg-surface-2" />
        <div className="h-11 w-24 animate-pulse rounded-md bg-surface-2" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 animate-pulse rounded-full bg-surface-2"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      {/* Main content area: stat cards + table-like rows */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-border bg-surface"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <div className="h-5 w-40 animate-pulse rounded-md bg-surface-2" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border p-3 last:border-b-0"
          >
            <div className="h-9 w-9 animate-pulse rounded-md bg-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-1/3 animate-pulse rounded-md bg-surface-2" />
              <div className="h-3 w-1/2 animate-pulse rounded-md bg-surface-2/60" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-surface-2" />
            <div className="h-4 w-20 animate-pulse rounded-md bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}