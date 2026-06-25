// Storefront section renderer (brief §2.2/2.3; DESIGN §Q1.3 sections). Renders
// the FIXED set of home sections in the seller's chosen order, skipping disabled
// ones. The set and order come from the validated ThemeSettings.sections array;
// there is no free composition here — this is a switch over a closed union, the
// render-side mirror of the customizer's no-drag constraint.
//
// Lives in the storefront app (not @hybrid/ui) because it composes existing
// design-system sections plus two small inline sections (announcement_bar /
// collections_grid) the catalog slice hasn't promoted to shared components.
import { Hero, ProductGrid, TrustBand } from "@hybrid/ui";
import type { StorefrontProduct } from "@hybrid/ui";
import type { ThemeSettings, SectionType } from "@/lib/theme/schema";
import { getDict } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionaries";

// Render-time http(s) guard (defense in depth alongside the Zod httpUrl check in
// the customizer action). Mirrors packages/ui/src/lib/safeUrl.ts but kept local
// to avoid a second export append on the shared ui index this wave.
function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    return undefined;
  }
  return undefined;
}

export interface StorefrontCollectionTile {
  id: string;
  title: string;
  slug: string;
}

interface ThemeSectionsProps {
  settings: ThemeSettings;
  storeName: string;
  products: StorefrontProduct[];
  collections: StorefrontCollectionTile[];
}

export async function ThemeSections({
  settings,
  storeName,
  products,
  collections,
}: ThemeSectionsProps) {
  const { locale, d } = await getDict();
  const ordered = [...settings.sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.position - b.position);

  return (
    <>
      {ordered.map((section) =>
        renderSection(section.type, { settings, storeName, products, collections }, locale, d),
      )}
    </>
  );
}

function renderSection(
  type: SectionType,
  props: ThemeSectionsProps,
  locale: Locale,
  d: Messages,
): React.ReactNode {
  const { settings, storeName, products, collections } = props;
  const content = settings.content;
  const t = d.storefront.home;

  switch (type) {
    case "announcement_bar":
      return content.heroSubline ? (
        <div
          key={type}
          className="bg-primary px-4 py-2 text-center text-sm font-medium text-white"
          role="status"
        >
          {content.heroSubline}
        </div>
      ) : null;

    case "hero":
      return (
        <Hero
          key={type}
          lang={locale}
          heading={
            content.heroHeadline ||
            `${storeName} — ${t.heroHeadlineSuffix}`
          }
          subheading={
            content.heroSubline ||
            t.heroSubline
          }
          ctaLabel={content.heroCta || t.heroCta}
          ctaHref="/products"
          imageUrl={safeUrl(content.heroImageUrl) ?? null}
        />
      );

    case "featured_products":
      return (
        <ProductGrid
          key={type}
          lang={locale}
          heading={t.featuredProducts}
          products={products}
          priorityCount={2}
        />
      );

    case "collections_grid":
      return collections.length > 0 ? (
        <section key={type} className="px-4 py-section" aria-labelledby="collections-heading">
          <div className="mx-auto max-w-storefront">
            <h2
              id="collections-heading"
              className="bn-heading mb-4 text-2xl font-bold text-ink"
            >
              {t.collections}
            </h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {collections.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/products?collection=${encodeURIComponent(c.slug)}`}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 py-6 text-center text-base font-semibold text-ink transition hover:border-primary"
                  >
                    {c.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null;

    case "trust_band":
      return <TrustBand key={type} lang={locale} />;

    default:
      return null;
  }
}
