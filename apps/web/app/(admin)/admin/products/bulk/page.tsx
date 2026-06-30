import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listProducts } from "@/lib/admin/catalog";
import { getDict } from "@/lib/i18n/server";
import { BulkProductTable } from "./BulkProductTable";

// Bulk product editor — select many products and set status or adjust prices in
// one go. Operator-facing (Latin numerals). Reuses the catalog list read.
export const dynamic = "force-dynamic";

export default async function BulkProductsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const products = await listProducts(tenantId, session.userId, { status: "all" });
  const { locale } = await getDict();

  return (
    <div className="space-y-4">
      <a href="/admin/products" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← পণ্য
      </a>
      <div>
        <h1 className="text-xl font-bold text-ink">বাল্ক এডিট</h1>
        <p className="text-sm text-ink-muted">
          একাধিক পণ্য বেছে স্ট্যাটাস বদলান বা দাম শতাংশে সমন্বয় করুন।
        </p>
      </div>
      <BulkProductTable
        products={products.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          price: p.price,
        }))}
        locale={locale}
      />
    </div>
  );
}
