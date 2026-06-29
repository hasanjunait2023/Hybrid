import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGrid } from "@hybrid/ui";
import {
  getStorefrontCollectionBySlug,
  getStorefrontProductsByCollection,
  getTenantContextBySlug,
} from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";

// Storefront collection detail — a category landing the home collection tiles
// and product-grid links point to. Renders the collection's active products.
interface CollectionPageProps {
  params: Promise<{ tenant: string; slug: string }>;
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { tenant: slug, slug: collectionSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) return { title: "Collection" };
  const collection = await getStorefrontCollectionBySlug(ctx.id, collectionSlug);
  if (!collection) return { title: "Collection" };
  const description = collection.description ?? `${collection.title} — ${ctx.store.name}`;
  return {
    title: `${collection.title} — ${ctx.store.name}`,
    description,
    openGraph: { title: collection.title, description, type: "website" },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { tenant: slug, slug: collectionSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const collection = await getStorefrontCollectionBySlug(ctx.id, collectionSlug);
  if (!collection) notFound();

  const products = await getStorefrontProductsByCollection(ctx.id, collection.id);
  const { locale } = await getDict();

  return (
    <div className="mx-auto max-w-storefront px-4 pt-4">
      {collection.description && (
        <p className="bn-body mb-2 mt-2 text-sm text-ink-muted">{collection.description}</p>
      )}
      <ProductGrid lang={locale} heading={collection.title} products={products} priorityCount={4} />
    </div>
  );
}
