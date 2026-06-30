// GET /api/admin/products/labels-list
//
// Returns a flat list of all products for the active tenant, with their
// barcode status. Used by the label picker UI to show checkboxes.
//
// Response: { items: { productId, title, status, barcode, variantCount }[],
//             nextCursor: string | null }
//
// Pagination: cursor-based on `created_at desc, id desc` so a tenant with
// thousands of products doesn't 500 on a single oversized payload. The picker
// UI calls with `?cursor=<created_at>|id` and renders a "load more" button when
// nextCursor comes back non-null. Default page size 200; hard cap 500.

import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@hybrid/db";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400 });
  }

  const url = req.nextUrl;
  const cursor = url.searchParams.get("cursor"); // "<created_at>|<id>" or null
  const requested = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_LIMIT)
      : DEFAULT_LIMIT;

  // Cursor is opaque to the client: "<ISO timestamp>|<uuid>". We split + re-encode
  // for safety. If the cursor doesn't match the format we 400 — better than
  // silently dropping the cursor and returning the top page (would confuse the
  // picker UI which detects "no nextCursor" as end-of-list).
  let cursorTs: string | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const sep = cursor.indexOf("|");
    if (sep <= 0) {
      return NextResponse.json({ error: "bad_cursor" }, { status: 400 });
    }
    cursorTs = cursor.slice(0, sep);
    cursorId = cursor.slice(sep + 1);
  }

  // Two branches for the query: cursor-mode and top-page-mode. Each is fully
  // typed (tx<Row[]>) so no `tx<unknown>` escape hatches. The WHERE clause is
  // omitted on the top-page branch; we use Postgres row-comparison
  // `(created_at, id) < ($1, $2)` which uses the natural pkey + created_at
  // index for a sargable scan.
  const rows = await withTenant(tenantId, session.userId, async (tx) => {
    if (cursorTs !== null && cursorId !== null) {
      return tx<{
        productId: string;
        title: string;
        status: string;
        barcode: string | null;
        variantCount: number;
        createdAt: Date;
      }[]>`
        select
          p.id as "productId",
          p.title,
          p.status,
          p.barcode,
          (select count(*)::int from product_variant v where v.product_id = p.id) as "variantCount",
          p.created_at as "createdAt"
        from product p
        where (p.created_at, p.id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
        order by p.created_at desc, p.id desc
        limit ${limit + 1}
      `;
    }
    return tx<{
      productId: string;
      title: string;
      status: string;
      barcode: string | null;
      variantCount: number;
      createdAt: Date;
    }[]>`
      select
        p.id as "productId",
        p.title,
        p.status,
        p.barcode,
        (select count(*)::int from product_variant v where v.product_id = p.id) as "variantCount",
        p.created_at as "createdAt"
      from product p
      order by p.created_at desc, p.id desc
      limit ${limit + 1}
    `;
  });

  // Fetch limit+1 to detect "is there a next page" without an extra query.
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? `${last.createdAt.toISOString()}|${last.productId}` : null;

  return NextResponse.json({ items: page, nextCursor });
}
