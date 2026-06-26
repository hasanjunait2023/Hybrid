// Storefront loading skeleton (Phase 1 polish — P1.2). Renders while the server
// is fetching tenant context + products for any route under _sites/[tenant].
// Mirrors the real ProductGrid layout (heading + 2-col mobile / 5-col desktop
// grid) so the layout doesn't jump when real data arrives. No content flash.
//
// DESIGN §6.4: only the first row of images loads eager; skeletons below use
// `bg-surface-2` to stay subtle and 3G-friendly (no big animated gradients).
export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-storefront px-4 py-section" aria-busy="true" aria-live="polite">
      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-surface-2" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
          >
            <div className="aspect-square animate-pulse bg-surface-2" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
              <div className="h-9 w-full animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}