"use client";
// Wholesale cart hook — separate from the retail useCart.
// localStorage-based, keyed per tenant slug, with MOQ enforcement.
import { useCallback, useEffect, useState } from "react";

export interface WholesaleCartLine {
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
  return `hybrid:wholesale-cart:${tenantSlug}`;
}

function readCart(tenantSlug: string): WholesaleCartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WholesaleCartLine[]) : [];
  } catch {
    return [];
  }
}

function writeCart(tenantSlug: string, lines: WholesaleCartLine[]): void {
  try {
    window.localStorage.setItem(storageKey(tenantSlug), JSON.stringify(lines));
    window.dispatchEvent(
      new CustomEvent("hybrid:wholesale-cart-changed", { detail: tenantSlug }),
    );
  } catch {
    // Quota / private-mode — degrade silently
  }
}

export interface UseWholesaleCart {
  lines: WholesaleCartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<WholesaleCartLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

export function useWholesaleCart(tenantSlug: string): UseWholesaleCart {
  const [lines, setLines] = useState<WholesaleCartLine[]>([]);

  useEffect(() => {
    setLines(readCart(tenantSlug));
    const sync = () => setLines(readCart(tenantSlug));
    window.addEventListener("storage", sync);
    window.addEventListener("hybrid:wholesale-cart-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hybrid:wholesale-cart-changed", sync as EventListener);
    };
  }, [tenantSlug]);

  const persist = useCallback(
    (next: WholesaleCartLine[]) => {
      setLines(next);
      writeCart(tenantSlug, next);
    },
    [tenantSlug],
  );

  const add = useCallback<UseWholesaleCart["add"]>(
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

  const setQuantity = useCallback<UseWholesaleCart["setQuantity"]>(
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

  const remove = useCallback<UseWholesaleCart["remove"]>(
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
