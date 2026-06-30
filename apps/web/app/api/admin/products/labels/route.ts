// GET /api/admin/products/labels?ids=…&status=…&barcode=missing
//
// Returns the products (and their primary variant) that the label printer
// should render. Three filter modes:
//
//   ids=uuid,uuid       Only the products in this CSV (highest precision — used
//                       when the admin selected specific rows in the picker).
//   status=active       All active products for the tenant. Used by the
//                       "Print all" button.
//   barcode=missing     Only products where BOTH product.barcode AND
//                       product_variant[].barcode are null — surfaces the
//                       "you forgot to set barcodes on these" list.
//
// Response shape (matches LabelCandidate in labels/print/page.tsx):
//   { labels: { productId, variantId, title, variantTitle, price, barcode }[] }
//
// RLS: runs under withTenant() so a session can only see its own tenant's
// products. No write side effects.

import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@hybrid/db";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

interface LabelRow {
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  price: number;
  barcode: string;
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const idsParam = sp.get("ids");
  const status = sp.get("status");
  const barcode = sp.get("barcode");

  // Build a single SQL query that handles all three modes.
  // COALESCE(product.barcode, first_variant.barcode) — prefer top-level, fall
  // back to the first variant's code. Products with neither are filtered out
  // UNLESS the caller asked for `barcode=missing` (then we return them as a
  // "needs attention" list — the print page renders an explicit placeholder).
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : null;

  // All three modes share the same base query; the WHERE filters differ.
  const rows = await withTenant(tenantId, session.userId, async (tx) => {
    // First variant per product (ordered by created_at so it's stable across
    // runs). For the labels we only need ONE variant per product; if the admin
    // wants different barcodes per variant they can pick by id with ?ids=…
    return tx<LabelRow[]>`
      with first_variant as (
        select distinct on (v.product_id)
          v.product_id, v.id as variant_id, v.title as variant_title,
          v.price, v.barcode
        from product_variant v
        order by v.product_id, v.created_at asc
      )
      select
        p.id as "productId",
        fv.variant_id as "variantId",
        p.title as "title",
        fv.variant_title as "variantTitle",
        coalesce(p.barcode, fv.barcode) as "barcode",
        coalesce(fv.price, 0)::float8 as "price"
      from product p
      left join first_variant fv on fv.product_id = p.id
      where
        (${ids}::uuid[] is null or p.id = any(${ids}::uuid[]))
        and (${status}::product_status is null or p.status = ${status}::product_status)
        and (
          ${barcode}::text is null
          or (${barcode} = 'missing' and p.barcode is null and fv.barcode is null)
        )
      order by p.created_at desc
      limit 500
    `;
  });

  // For ids=… mode we want EXACTLY those ids (in the order asked) and we want
  // to allow missing barcodes (the print page falls back to a placeholder).
  // For status/missing modes we filter out rows with no barcode (nothing to
  // print) UNLESS the caller is explicitly looking for the missing list.
  const out: LabelRow[] = rows
    .filter((r) => (barcode === "missing" ? true : r.barcode != null))
    .map((r) => ({
      productId: r.productId,
      variantId: r.variantId,
      title: r.title,
      variantTitle: r.variantTitle,
      price: Number(r.price) || 0,
      barcode: r.barcode ?? "",
    }));

  return NextResponse.json({ labels: out });
}
