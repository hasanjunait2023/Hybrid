// Storefront renderer for OS 2.0 page builder blocks.
// Reads the merchant's home page block composition from store_page (type='home').
// Falls back gracefully: if a block type has no renderer, it renders nothing.
// Only http(s) URLs are passed to img/href — the validated data model enforces
// this at save time; we double-check here with safeUrl() (defense in depth).
import Link from "next/link";
import { Hero, ProductGrid, TrustBand } from "@hybrid/ui";
import type { StorefrontProduct } from "@hybrid/ui";
import type { HomePageBlocks, PageBlock } from "@/lib/theme/pageBuilder";
import type { Locale } from "@/lib/i18n/config";
import type { StorefrontCollectionTile } from "./ThemeSections";

function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const p = new URL(url);
    if (p.protocol === "http:" || p.protocol === "https:") return url;
  } catch {
    return undefined;
  }
  return undefined;
}

interface HomePageBuilderProps {
  blocks: HomePageBlocks;
  products: StorefrontProduct[];
  collections: StorefrontCollectionTile[];
  locale: Locale;
  storeName: string;
}

export function HomePageBuilder({
  blocks,
  products,
  collections,
  locale,
  storeName,
}: HomePageBuilderProps) {
  return (
    <>
      {blocks.map((block, i) => (
        <BlockRenderer
          key={block.id}
          block={block}
          products={products}
          collections={collections}
          locale={locale}
          storeName={storeName}
          priority={i < 2}
        />
      ))}
    </>
  );
}

function BlockRenderer({
  block,
  products,
  collections,
  locale,
  storeName,
  priority,
}: {
  block: PageBlock;
  products: StorefrontProduct[];
  collections: StorefrontCollectionTile[];
  locale: Locale;
  storeName: string;
  priority: boolean;
}) {
  if (block.type === "announcement_bar") {
    const { text } = block.settings;
    if (!text) return null;
    return (
      <div
        role="status"
        className="bg-primary px-4 py-2 text-center text-sm font-medium text-white"
      >
        {text}
      </div>
    );
  }

  if (block.type === "hero") {
    const { headline, subline, cta_text, cta_url, image_url } = block.settings;
    return (
      <Hero
        lang={locale}
        heading={headline || `${storeName} — আপনাকে স্বাগতম`}
        subheading={subline || ""}
        ctaLabel={cta_text || "পণ্য দেখুন"}
        ctaHref={safeUrl(cta_url) ?? "/products"}
        imageUrl={safeUrl(image_url) ?? null}
      />
    );
  }

  if (block.type === "featured_products") {
    const { heading, product_count } = block.settings;
    const slice = products.slice(0, product_count);
    return (
      <ProductGrid
        lang={locale}
        heading={heading || (locale === "bn" ? "সেরা পণ্য" : "Featured Products")}
        products={slice}
        priorityCount={priority ? 2 : 0}
      />
    );
  }

  if (block.type === "collections_grid") {
    const { heading } = block.settings;
    if (collections.length === 0) return null;
    return (
      <section className="px-4 py-section" aria-labelledby="pb-collections">
        <div className="mx-auto max-w-storefront">
          {heading && (
            <h2 id="pb-collections" className="bn-heading mb-4 text-2xl font-bold text-ink">
              {heading}
            </h2>
          )}
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
    );
  }

  if (block.type === "trust_band") {
    return <TrustBand lang={locale} />;
  }

  if (block.type === "image_text") {
    const { heading, body, image_url, image_side, cta_text, cta_url } = block.settings;
    const imgSrc = safeUrl(image_url);
    const reverse = image_side === "right";
    return (
      <section className="px-4 py-section">
        <div
          className={`mx-auto flex max-w-storefront flex-col gap-6 md:flex-row ${reverse ? "md:flex-row-reverse" : ""}`}
        >
          {imgSrc && (
            <div className="shrink-0 md:w-[45%]">
              <img
                src={imgSrc}
                alt=""
                className="h-auto w-full rounded-xl object-cover"
              />
            </div>
          )}
          <div className="flex flex-col justify-center gap-3">
            {heading && <h2 className="bn-heading text-2xl font-bold text-ink">{heading}</h2>}
            {body && <p className="whitespace-pre-line text-base leading-relaxed text-ink-muted">{body}</p>}
            {cta_text && safeUrl(cta_url) && (
              <Link
                href={safeUrl(cta_url)!}
                className="mt-2 inline-flex min-h-[44px] w-fit items-center rounded-lg bg-primary px-6 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                {cta_text}
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "rich_text") {
    const { content } = block.settings;
    if (!content) return null;
    return (
      <section className="px-4 py-section">
        <div className="mx-auto max-w-prose">
          <p className="whitespace-pre-line text-base leading-relaxed text-ink">{content}</p>
        </div>
      </section>
    );
  }

  if (block.type === "cta_banner") {
    const { heading, button_text, button_url } = block.settings;
    const href = safeUrl(button_url);
    return (
      <section className="bg-primary/5 px-4 py-12 text-center">
        {heading && <h2 className="mb-4 text-2xl font-bold text-ink">{heading}</h2>}
        {button_text && href && (
          <Link
            href={href}
            className="inline-flex min-h-[52px] items-center rounded-lg bg-primary px-10 text-lg font-bold text-white shadow-md hover:bg-primary-hover"
          >
            {button_text}
          </Link>
        )}
      </section>
    );
  }

  if (block.type === "spacer") {
    const { height_rem } = block.settings;
    return <div style={{ height: `${height_rem}rem` }} aria-hidden />;
  }

  return null;
}
