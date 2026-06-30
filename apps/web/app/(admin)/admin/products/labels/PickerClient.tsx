"use client";

// Barcode label picker (DESIGN §P3.2).
//
// Lists all active products with their barcode (or a "no barcode" warning
// badge). The admin checks the ones they want to print and clicks "Print N
// labels" — that opens the print view in a new tab with the id list.
//
// Two quick actions on top:
//   • "Print all with barcodes" — opens print view with ?status=active
//   • "Show products missing barcodes" — inline filter (highlighted rows)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@hybrid/ui";

interface Candidate {
  productId: string;
  title: string;
  status: string;
  barcode: string | null;
  variantCount: number;
}

export function PickerClient() {
  const m = useT();
  const router = useRouter();
  const [items, setItems] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showMissing, setShowMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/products/labels-list")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { items: Candidate[] };
      })
      .then((d) => setItems(d.items))
      .catch((e: Error) => setErr(e.message));
  }, []);

  const visible = useMemo(
    () => (showMissing ? items.filter((i) => i.barcode == null) : items),
    [items, showMissing],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (picked.size === visible.length) setPicked(new Set());
    else setPicked(new Set(visible.map((v) => v.productId)));
  }
  function printPicked() {
    if (!picked.size) return;
    const qs = new URLSearchParams({ ids: Array.from(picked).join(",") });
    window.open(`/admin/products/labels/print?${qs.toString()}`, "_blank");
  }
  function printAll() {
    window.open(`/admin/products/labels/print?status=active`, "_blank");
  }
  function printMissing() {
    setShowMissing(true);
    setPicked(new Set(items.filter((i) => i.barcode == null).map((i) => i.productId)));
  }

  if (err) {
    return <div className="p-6 text-sm text-red-600">{m.common.state.error}: {err}</div>;
  }

  const withBarcode = items.filter((i) => i.barcode != null).length;
  const withoutBarcode = items.length - withBarcode;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-ink">Print barcode labels</h1>
        <span className="text-sm text-ink-muted">
          {withBarcode} with barcode · {withoutBarcode} without
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={printAll} disabled={!withBarcode}>
            Print all with barcodes
          </Button>
          <Button variant="ghost" onClick={printMissing} disabled={!withoutBarcode}>
            Show missing barcodes
          </Button>
          <Button onClick={printPicked} disabled={!picked.size}>
            Print {picked.size} label{picked.size === 1 ? "" : "s"}
          </Button>
        </div>
      </header>

      {showMissing && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Showing {visible.length} product{visible.length === 1 ? "" : "s"} with no barcode set.
          Edit each product to add a barcode, then come back to print labels.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs font-semibold uppercase text-ink-muted">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={picked.size > 0 && picked.size === visible.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                  className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                />
              </th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Variants</th>
              <th className="px-3 py-2">Barcode</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((it) => (
              <tr
                key={it.productId}
                className={`border-t border-border ${it.barcode == null ? "bg-amber-50/50" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={picked.has(it.productId)}
                    onChange={() => toggle(it.productId)}
                    aria-label={`Select ${it.title}`}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                  />
                </td>
                <td className="px-3 py-2 font-medium text-ink">{it.title}</td>
                <td className="px-3 py-2 text-ink-muted">{it.status}</td>
                <td className="px-3 py-2 text-ink-muted">{it.variantCount}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink">
                  {it.barcode ?? <span className="text-amber-700">missing</span>}
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                  No products.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
