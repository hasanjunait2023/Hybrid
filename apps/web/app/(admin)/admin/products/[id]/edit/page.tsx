import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getProductFull, listCollections } from "@/lib/admin/catalog";
import { getDict } from "@/lib/i18n/server";
import { ProductForm, type ProductFormData } from "../../ProductForm";

// Edit a product (DESIGN §P4) — full options/variant-matrix/images/collections.
// Server-loads the record under the user's tenant (RLS); the ProductForm posts
// updateProduct, which revalidates the storefront tags (admin edit → storefront
// update loop, the P0 thesis).
interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;

  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [product, collections] = await Promise.all([
    getProductFull(tenantId, session.userId, id),
    listCollections(tenantId, session.userId),
  ]);
  if (!product) notFound();

  const { d } = await getDict();

  const initial: ProductFormData = {
    id: product.id,
    title: product.title,
    description: product.description ?? "",
    status: (product.status as ProductFormData["status"]) ?? "draft",
    options: product.options,
    variants: product.variants.map((v) => ({
      id: v.id,
      options: v.options,
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      inventory: v.inventory,
      isActive: v.isActive,
    })),
    imageUrls: product.images.map((i) => i.url),
    videos: product.videos.map((v) => ({
      url: v.url,
      posterUrl: v.posterUrl,
      title: v.title,
      duration: v.durationSeconds,
    })),
    collectionIds: product.collectionIds,
    marketplaceHidden: product.marketplaceHidden,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/products" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← {d.admin.products.title}
        </a>
        <h1 className="truncate text-xl font-bold text-ink">{product.title}</h1>
      </div>
      <ProductForm
        initial={initial}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
      />
    </div>
  );
}
