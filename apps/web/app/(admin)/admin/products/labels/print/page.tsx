"use client";

// Barcode label printing — print view (DESIGN §P3.2).
//
// The query string drives the print:
//   ?ids=uuid,uuid,uuid   -> only those products
//   ?status=active        -> all active products
//   ?barcode=missing      -> only products with no barcode (to alert the admin)
//
// Each label is a 1.5"x1" tile (38mm x 25mm thermal standard, the dominant
// sticker size in BD retail). On A4 (or Letter) we get 21 cols x 27 rows =
// ~567 labels per sheet; the grid auto-fits based on the available width.
//
// The Code128 barcode is rendered client-side from bwip-js into an inline SVG
// (no canvas, no flicker, scales with print zoom). Each label shows:
//   • Product title (truncated with ellipsis if > 24 chars)
//   • Variant title if a variant was selected
//   • Price in ৳ (Latin numerals — the view is operator-facing, not customer)
//   • Code128 barcode with the human-readable digits below
//
// Print sheet CSS hides everything except `.label-sheet` (@page rule sets the
// print area to A4 with 5mm margin). The "Print" button calls window.print().

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import bwipjs from "bwip-js/browser";
import { useT } from "@/lib/i18n/useT";

// Server returns this shape (see api/admin/products/labels/route.ts).
export interface LabelCandidate {
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  price: number;
  barcode: string;
}

export default function LabelsPrintPage() {
  const sp = useSearchParams();
  const m = useT();
  const [labels, setLabels] = useState<LabelCandidate[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ids = sp.get("ids");
    const params = new URLSearchParams();
    if (ids) params.set("ids", ids);
    const status = sp.get("status");
    if (status) params.set("status", status);
    const mode = sp.get("barcode");
    if (mode) params.set("barcode", mode);

    fetch(`/api/admin/products/labels?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { labels: LabelCandidate[] };
      })
      .then((d) => setLabels(d.labels))
      .catch((e: Error) => setErr(e.message));
  }, [sp]);

  if (err) {
    return (
      <div className="p-6 text-sm text-red-600">
        {m.common.state.error}: {err}
      </div>
    );
  }
  if (!labels.length) {
    return (
      <div className="p-6 text-sm text-ink-muted">{m.common.state.empty}</div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-sticky flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <span className="text-sm font-semibold text-ink">
          {labels.length} {labels.length === 1 ? "label" : "labels"}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Print
        </button>
      </div>

      {/* Sheet — 38mm x 25mm tiles in a CSS grid that auto-flows */}
      <div ref={sheetRef} className="label-sheet mx-auto p-2">
        <div
          className="grid gap-1"
          style={{
            // 96dpi screen: 38mm ≈ 144px, 25mm ≈ 94px.
            // Min 144px so labels don't shrink below readable; 1fr fills row.
            gridTemplateColumns: "repeat(auto-fill, minmax(144px, 1fr))",
          }}
        >
          {labels.map((l, i) => (
            <LabelTile key={`${l.productId}-${l.variantId ?? "_"}-${i}`} label={l} />
          ))}
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 5mm; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .label-sheet { padding: 0 !important; }
        }
        .label-tile {
          width: 144px;
          height: 94px;
          padding: 4px 6px;
          background: white;
          color: black;
          border: 1px dashed var(--color-border, lightgray);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        @media print {
          .label-tile { border: none; }
        }
        .label-title {
          font-size: 9px;
          font-weight: 600;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.1;
        }
        .label-variant {
          font-size: 8px;
          color: #444;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .label-barcode {
          width: 100%;
          height: 32px;
        }
        .label-barcode svg { width: 100%; height: 100%; display: block; }
        .label-meta {
          display: flex;
          width: 100%;
          align-items: baseline;
          justify-content: space-between;
          font-size: 8px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
        }
        .label-price { font-weight: 700; }
        .label-code {
          font-size: 7px;
          letter-spacing: 0.5px;
          color: #333;
        }
      `}</style>
    </div>
  );
}

function LabelTile({ label }: { label: LabelCandidate }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      // Code128 supports the full ASCII range — safe for any barcode string.
      // 1.4:1 height/width ratio is the standard for product labels.
      const svgString = bwipjs.toSVG({
        bcid: "code128",
        text: label.barcode,
        height: 12, // mm
        includetext: false, // we render the digits ourselves in the tile
        scale: 2,
        barcolor: "black",
        backgroundcolor: "white",
      });
      svgRef.current.innerHTML = svgString;
    } catch {
      // Swallow: bwipjs throws on invalid chars, but we already filter in the API.
    }
  }, [label.barcode]);

  return (
    <div className="label-tile">
      <div className="label-title" title={label.title}>
        {label.title}
      </div>
      {label.variantTitle && <div className="label-variant">{label.variantTitle}</div>}
      <div className="label-barcode">
        <svg ref={svgRef} />
      </div>
      <div className="label-meta">
        <span className="label-price">৳{label.price.toFixed(0)}</span>
        <span className="label-code">{label.barcode}</span>
      </div>
    </div>
  );
}
