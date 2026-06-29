import { notFound } from "next/navigation";
import { ProductGrid } from "@hybrid/ui";
import { getTenantContextBySlug, searchStorefrontProducts } from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";

// Storefront product search. The header search icon links here; results come
// from a title match. Server-rendered, mobile-first; the form GETs back to /search?q=.
interface SearchPageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const q = (await searchParams).q?.trim() ?? "";
  const { locale, d } = await getDict();
  const t = d.storefront.products;
  const results = q ? await searchStorefrontProducts(ctx.id, q) : [];

  return (
    <div className="mx-auto max-w-storefront px-4 pt-4">
      <form method="get" action="" className="mb-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.searchPlaceholder}
          autoFocus
          className="h-11 flex-1 rounded-lg border border-border-strong bg-surface px-4 text-base"
        />
        <button
          type="submit"
          className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white"
        >
          {t.searchButton}
        </button>
      </form>

      {!q ? (
        <p className="bn-body py-10 text-center text-ink-subtle">{t.searchPrompt}</p>
      ) : results.length === 0 ? (
        <p className="bn-body py-10 text-center text-ink-subtle">{t.searchEmpty}</p>
      ) : (
        <ProductGrid lang={locale} heading={t.searchTitle} products={results} priorityCount={4} />
      )}
    </div>
  );
}
