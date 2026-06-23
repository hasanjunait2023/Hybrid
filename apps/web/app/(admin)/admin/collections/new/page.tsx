import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listProducts } from "@/lib/admin/catalog";
import { CollectionForm } from "../CollectionForm";

export default async function NewCollectionPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const products = await listProducts(tenantId, session.userId);

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/collections" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← কালেকশন
        </a>
        <h1 className="text-xl font-bold text-ink">নতুন কালেকশন</h1>
      </div>
      <CollectionForm
        initial={{ title: "", description: "", memberIds: [] }}
        products={products.map((p) => ({ id: p.id, title: p.title }))}
      />
    </div>
  );
}
