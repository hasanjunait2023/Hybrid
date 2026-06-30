import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listProducts } from "@/lib/admin/catalog";
import { getDict } from "@/lib/i18n/server";
import { CollectionForm } from "../CollectionForm";

export default async function NewCollectionPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const products = await listProducts(tenantId, session.userId);

  const { d } = await getDict();
  const t = d.admin.collections;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/collections" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← {t.backLink}
        </a>
        <h1 className="text-xl font-bold text-ink">{t.newCollection}</h1>
      </div>
      <CollectionForm
        initial={{ title: "", description: "", memberIds: [] }}
        products={products.map((p) => ({ id: p.id, title: p.title }))}
      />
    </div>
  );
}
