import { Button } from "../Button";
import { CheckIcon } from "../icons";

interface HeroProps {
  heading: string;
  subheading?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Optional single hero image (the only eager image on the page). */
  imageUrl?: string | null;
  /** "en" (system default) or "bn" — pass the active locale from getDict/useDict. */
  lang?: "bn" | "en";
}

const COPY = {
  bn: {
    cta: "কিনুন",
    chips: ["৭ দিনে রিটার্ন", "ক্যাশ অন ডেলিভারি", "অরিজিনাল প্রোডাক্ট"],
  },
  en: {
    cta: "Shop now",
    chips: ["7-day returns", "Cash on Delivery", "Authentic products"],
  },
} as const;

// DESIGN §6.1 #2 — single focused banner, NO carousel (LCP/3G). When no image
// is set we render a flat indigo panel (cheap to paint) instead of imagery.
// Trust chips below the hero are the single biggest trust lever — kept always.
export function Hero({
  heading,
  subheading,
  ctaLabel,
  ctaHref = "/products",
  imageUrl,
  lang = "en",
}: HeroProps) {
  const t = COPY[lang];
  const cta = ctaLabel ?? t.cta;
  return (
    <section aria-labelledby="hero-heading" className="px-4 pt-4">
      <div className="mx-auto max-w-storefront">
        <div className="relative overflow-hidden rounded-xl bg-primary text-ink-on-primary">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              width={1200}
              height={600}
              fetchPriority="high"
              decoding="async"
              className="h-56 w-full object-cover md:h-80"
            />
          ) : (
            <div className="h-56 w-full md:h-80" aria-hidden />
          )}

          <div className="absolute inset-0 flex flex-col justify-center gap-3 p-6 md:p-10">
            <h1
              id="hero-heading"
              className="bn-heading max-w-xl text-3xl font-bold"
            >
              {heading}
            </h1>
            {subheading && (
              <p className="bn-body max-w-md text-base/relaxed opacity-90">
                {subheading}
              </p>
            )}
            <div>
              <a href={ctaHref}>
                <Button variant="accent" size="lg">
                  {cta}
                </Button>
              </a>
            </div>
          </div>
        </div>

        <TrustChips chips={t.chips} />
      </div>
    </section>
  );
}

function TrustChips({ chips }: { chips: readonly string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {chips.map((label) => (
        <li
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
        >
          <CheckIcon width={14} height={14} className="text-cod" />
          {label}
        </li>
      ))}
    </ul>
  );
}
