"use client";
// Client-side cart (blueprint S-CHECKOUT: "localStorage cart keyed by tenant
// slug; no server cart"). The storefront has no server cart — the buyer's cart
// lives only in their browser until they submit checkout (where placeOrder
// re-prices from the DB; the stored price here is display-only and never trusted).
//
// Keyed per tenant slug so two stores open in two tabs don't share a cart.
import { useCallback, useEffect, useState } from "react";

export interface CartLine {
  variantId: string;
  productSlug: string;
  title: string;
  variantTitle?: string | null;
  /** Display price only — re-priced server-side at checkout. */
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

function storageKey(tenantSlug: string): string {
  return `hybrid:cart:${tenantSlug}`;
}

function readCart(tenantSlug: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

function writeCart(tenantSlug: string, lines: CartLine[]): void {
  try {
    window.localStorage.setItem(storageKey(tenantSlug), JSON.stringify(lines));
    // Notify other components/tabs listening on the same key.
    window.dispatchEvent(new CustomEvent("hybrid:cart-changed", { detail: tenantSlug }));
  } catch {
    // Quota / private-mode — degrade silently; cart just won't persist.
  }
}

export interface UseCart {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

export function useCart(tenantSlug: string): UseCart {
  const [lines, setLines] = useState<CartLine[]>([]);

  // Hydrate from localStorage after mount (SSR renders an empty cart) and keep
  // in sync across tabs/components via the storage + custom events.
  useEffect(() => {
    setLines(readCart(tenantSlug));
    const sync = () => setLines(readCart(tenantSlug));
    window.addEventListener("storage", sync);
    window.addEventListener("hybrid:cart-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hybrid:cart-changed", sync as EventListener);
    };
  }, [tenantSlug]);

  const persist = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      writeCart(tenantSlug, next);
    },
    [tenantSlug],
  );

  const add = useCallback<UseCart["add"]>(
    (line, quantity = 1) => {
      const current = readCart(tenantSlug);
      const existing = current.find((l) => l.variantId === line.variantId);
      const next = existing
        ? current.map((l) =>
            l.variantId === line.variantId
              ? { ...l, quantity: l.quantity + quantity }
              : l,
          )
        : [...current, { ...line, quantity }];
      persist(next);
    },
    [tenantSlug, persist],
  );

  const setQuantity = useCallback<UseCart["setQuantity"]>(
    (variantId, quantity) => {
      const current = readCart(tenantSlug);
      const next =
        quantity <= 0
          ? current.filter((l) => l.variantId !== variantId)
          : current.map((l) => (l.variantId === variantId ? { ...l, quantity } : l));
      persist(next);
    },
    [tenantSlug, persist],
  );

  const remove = useCallback<UseCart["remove"]>(
    (variantId) => {
      persist(readCart(tenantSlug).filter((l) => l.variantId !== variantId));
    },
    [tenantSlug, persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  return { lines, count, subtotal, add, setQuantity, remove, clear };
}
