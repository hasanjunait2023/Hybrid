"use client";

// Marketplace cart — one localStorage cart spanning vendors (key hybrid:mpcart).
// Each line carries its vendor tenantId so checkout can split by vendor. Prices
// are display-only; placeOrder re-prices server-side. Mirrors the storefront
// useCart, minus per-tenant keying.
import { useCallback, useEffect, useState } from "react";

export interface MpCartLine {
  tenantId: string;
  variantId: string;
  vendorSlug: string;
  vendorName: string;
  productSlug: string;
  title: string;
  variantTitle?: string | null;
  price: number; // display only
  quantity: number;
  imageUrl?: string | null;
}

const KEY = "hybrid:mpcart";

function read(): MpCartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as MpCartLine[]) : [];
  } catch {
    return [];
  }
}

function write(lines: MpCartLine[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
    window.dispatchEvent(new CustomEvent("hybrid:mpcart-changed"));
  } catch {
    // quota / private mode — degrade silently
  }
}

export interface UseMpCart {
  lines: MpCartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<MpCartLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

export function useMpCart(): UseMpCart {
  const [lines, setLines] = useState<MpCartLine[]>([]);

  useEffect(() => {
    setLines(read());
    const sync = () => setLines(read());
    window.addEventListener("storage", sync);
    window.addEventListener("hybrid:mpcart-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hybrid:mpcart-changed", sync as EventListener);
    };
  }, []);

  const persist = useCallback((next: MpCartLine[]) => {
    setLines(next);
    write(next);
  }, []);

  const add = useCallback<UseMpCart["add"]>((line, quantity = 1) => {
    const cur = read();
    const existing = cur.find((l) => l.variantId === line.variantId);
    persist(
      existing
        ? cur.map((l) => (l.variantId === line.variantId ? { ...l, quantity: l.quantity + quantity } : l))
        : [...cur, { ...line, quantity }],
    );
  }, [persist]);

  const setQuantity = useCallback<UseMpCart["setQuantity"]>((variantId, quantity) => {
    const cur = read();
    persist(
      quantity <= 0
        ? cur.filter((l) => l.variantId !== variantId)
        : cur.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
    );
  }, [persist]);

  const remove = useCallback<UseMpCart["remove"]>(
    (variantId) => persist(read().filter((l) => l.variantId !== variantId)),
    [persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  return {
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + l.price * l.quantity, 0),
    add,
    setQuantity,
    remove,
    clear,
  };
}
