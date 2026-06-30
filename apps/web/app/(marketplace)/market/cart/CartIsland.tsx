"use client";

import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import { useMpCart, type MpCartLine } from "./useMpCart";

// Cross-vendor cart, grouped by vendor. Display-only prices.
export function CartIsland() {
  const cart = useMpCart();

  if (cart.lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink-muted">আপনার কার্ট খালি।</p>
        <Link href="/" className="mt-3 inline-block text-primary">
          কেনাকাটা শুরু করুন
        </Link>
      </div>
    );
  }

  const byVendor = new Map<string, MpCartLine[]>();
  for (const l of cart.lines) {
    byVendor.set(l.vendorName, [...(byVendor.get(l.vendorName) ?? []), l]);
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      {[...byVendor.entries()].map(([vendorName, lines]) => (
        <section key={vendorName} className="rounded-lg border border-border bg-surface">
          <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">{vendorName}</h2>
          <ul>
            {lines.map((l) => (
              <li key={l.variantId} className="flex gap-3 border-b border-border p-3 last:border-0">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-surface-2">
                  {l.imageUrl ? (
                    <img src={l.imageUrl} alt={l.title} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-ink">{l.title}</span>
                  {l.variantTitle ? (
                    <span className="text-xs text-ink-muted">{l.variantTitle}</span>
                  ) : null}
                  <span className="text-sm font-semibold">{formatBdtBangla(l.price)}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="কমান"
                      onClick={() => cart.setQuantity(l.variantId, l.quantity - 1)}
                      className="h-11 w-11 rounded border border-border text-lg"
                    >
                      −
                    </button>
                    <span className="w-8 text-center">{l.quantity}</span>
                    <button
                      type="button"
                      aria-label="বাড়ান"
                      onClick={() => cart.setQuantity(l.variantId, l.quantity + 1)}
                      className="h-11 w-11 rounded border border-border text-lg"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => cart.remove(l.variantId)}
                      className="ml-auto inline-flex min-h-[44px] items-center px-2 text-xs text-danger"
                    >
                      সরান
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-sm">
            মোট: <strong>{formatBdtBangla(cart.subtotal)}</strong>
            <span className="text-ink-muted"> (+ ডেলিভারি)</span>
          </span>
          <Link
            href="/checkout"
            className="min-h-[44px] rounded-md bg-primary px-6 py-2 font-medium text-white hover:bg-primary-hover"
          >
            চেকআউট
          </Link>
        </div>
      </div>
    </div>
  );
}
