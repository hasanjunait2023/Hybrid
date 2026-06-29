import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorePage, getTenantContextBySlug } from "@/lib/storefront/data";

// Static / policy pages (privacy, returns, terms, about, custom). Reads a
// published store_page via the cached storefront data layer and renders its
// plain-text body (whitespace-preserved, no raw HTML — seller content is never
// injected as markup). Fixes the footer policy links that previously 404'd.
interface StorePageProps {
  params: Promise<{ tenant: string; slug: string }>;
}

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { tenant: slug, slug: pageSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) return { title: "Page" };
  const page = await getStorePage(ctx.id, pageSlug);
  if (!page) return { title: "Page" };
  const title = page.seoTitle ?? `${page.title} — ${ctx.store.name}`;
  const description = page.seoDescription ?? page.body.replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function StorePage({ params }: StorePageProps) {
  const { tenant: slug, slug: pageSlug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const page = await getStorePage(ctx.id, pageSlug);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-storefront px-4 pb-16 pt-6">
      <article className="prose-storefront">
        <h1 className="bn-heading mb-5 text-2xl font-bold text-ink">{page.title}</h1>
        {page.body ? (
          <div className="bn-body whitespace-pre-line text-base leading-relaxed text-ink-muted">
            {page.body}
          </div>
        ) : (
          <p className="bn-body text-ink-subtle">—</p>
        )}
      </article>
    </div>
  );
}
