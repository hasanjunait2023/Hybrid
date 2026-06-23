import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCollections } from "@/lib/admin/catalog";
import { ProductForm, type ProductFormData } from "../ProductForm";

// New product (DESIGN §P4). Starts with a single default variant; adding options
// regenerates the variant matrix. Posts createProduct (which redirects to edit).
export default async function NewProductPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const collections = await listCollections(tenantId, session.userId);

  const initial: ProductFormData = {
    title: "",
    description: "",
    status: "draft",
    options: [],
    variants: [{ options: {}, title: null, sku: null, price: 0, inventory: 0, isActive: true }],
    imageUrls: [],
    collectionIds: [],
  };

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/products" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← পণ্য
        </a>
        <h1 className="text-xl font-bold text-ink">নতুন পণ্য</h1>
      </div>
      <ProductForm
        initial={initial}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
      />
    </div>
  );
}
