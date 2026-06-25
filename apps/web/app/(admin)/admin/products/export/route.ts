// Product CSV export (P2-5). Auth + tenant, then stream the catalog as CSV.
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listProducts } from "@/lib/admin/catalog";
import { productsToCsv } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return new Response("No tenant", { status: 403 });

  const products = await listProducts(tenantId, session.userId, {});
  const csv = productsToCsv(
    products.map((p) => ({
      title: p.title,
      slug: p.slug,
      status: p.status,
      price: p.price,
      inventory: p.inventory,
    })),
  );
  return new Response(String.fromCharCode(0xfeff) + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="products.csv"',
    },
  });
}
