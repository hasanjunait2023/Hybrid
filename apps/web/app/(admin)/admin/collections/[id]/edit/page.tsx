import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCollection, listProducts } from "@/lib/admin/catalog";
import { CollectionForm } from "../../CollectionForm";

interface EditCollectionPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCollectionPage({ params }: EditCollectionPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [data, products] = await Promise.all([
    getCollection(tenantId, session.userId, id),
    listProducts(tenantId, session.userId),
  ]);
  if (!data) notFound();

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/collections" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← কালেকশন
        </a>
        <h1 className="truncate text-xl font-bold text-ink">{data.collection.title}</h1>
      </div>
      <CollectionForm
        initial={{
          id: data.collection.id,
          title: data.collection.title,
          description: data.collection.description ?? "",
          memberIds: data.memberIds,
        }}
        products={products.map((p) => ({ id: p.id, title: p.title }))}
      />
    </div>
  );
}
