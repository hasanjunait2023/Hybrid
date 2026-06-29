import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getPublishedLandingPage, type LpBlock } from "@/lib/admin/landingPages";

interface Props {
  params: Promise<{ tenant: string; slug: string }>;
}

// Public landing page renderer. Only published pages are served.
// Uses getPublishedLandingPage (withTenant, status='published' filter).
export default async function LandingPageRoute({ params }: Props) {
  const { tenant: tenantSlug, slug } = await params;
  const ctx = await getTenantContextBySlug(tenantSlug);
  if (!ctx) notFound();

  const page = await getPublishedLandingPage(ctx.id, ctx.id, slug);
  if (!page) notFound();

  return (
    <div className="flex flex-col gap-0">
      {page.blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: LpBlock }) {
  if (block.type === "hero") {
    return (
      <section className="relative flex min-h-[320px] flex-col items-center justify-center gap-4 bg-primary/5 px-4 py-12 text-center">
        {block.image_url ? (
          <img
            src={block.image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20"
          />
        ) : null}
        <div className="relative z-10 flex flex-col items-center gap-3">
          {block.title ? (
            <h1 className="text-2xl font-bold text-ink md:text-4xl">{block.title}</h1>
          ) : null}
          {block.subtitle ? (
            <p className="max-w-prose text-base text-ink-muted">{block.subtitle}</p>
          ) : null}
          {block.cta_text && block.cta_url ? (
            <Link
              href={block.cta_url}
              className="mt-2 inline-flex min-h-[48px] items-center rounded-lg bg-primary px-8 text-base font-semibold text-white shadow-md hover:bg-primary-hover"
            >
              {block.cta_text}
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  if (block.type === "text") {
    return (
      <section className="mx-auto max-w-prose px-4 py-8">
        <p className="whitespace-pre-line text-base leading-relaxed text-ink">{block.content}</p>
      </section>
    );
  }

  if (block.type === "image") {
    return (
      <section className="px-4 py-6">
        <img
          src={block.url}
          alt={block.alt}
          className="mx-auto max-w-2xl rounded-xl object-contain"
        />
      </section>
    );
  }

  if (block.type === "cta") {
    return (
      <section className="flex justify-center px-4 py-8">
        <Link
          href={block.url}
          className="inline-flex min-h-[52px] items-center rounded-lg bg-primary px-10 text-lg font-bold text-white shadow-md hover:bg-primary-hover"
        >
          {block.text}
        </Link>
      </section>
    );
  }

  return null;
}
