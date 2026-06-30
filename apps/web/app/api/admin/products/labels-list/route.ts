// GET /api/admin/products/labels-list
//
// Returns a flat list of all products for the active tenant, with their
// barcode status. Used by the label picker UI to show checkboxes.
//
// Response: { items: { productId, title, status, barcode, variantCount }[] }

import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@hybrid/db";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400 });
  }

  const rows = await withTenant(tenantId, session.userId, (tx) =>
    tx<{
      productId: string;
      title: string;
      status: string;
      barcode: string | null;
      variantCount: number;
    }[]>`
      select
        p.id as "productId",
        p.title,
        p.status,
        p.barcode,
        (select count(*)::int from product_variant v where v.product_id = p.id) as "variantCount"
      from product p
      order by p.created_at desc
      limit 500
    `,
  );

  return NextResponse.json({ items: rows });
}
