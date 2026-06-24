import Link from "next/link";
import { Button, toBnDigits, PhoneIcon } from "@hybrid/ui";
import { getMarketingLocale } from "../../lib/i18n/locale";
import {
  getMessages,
  type Locale,
  type MarketingMessages,
  type PricingTier,
} from "../../lib/i18n/marketing";
import { LangToggle } from "./_components/LangToggle";
import { FaqAccordion } from "./_components/FaqAccordion";
import { PartnerLogos } from "./_components/PartnerLogos";
import { MarketingImage } from "./_components/MarketingImage";
import { Avatar } from "./_components/Avatar";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

// Premium Shopify × ZatiqEasy hybrid landing. Bengali-default with an EN/BN
// cookie toggle resolved server-side (no hydration flash). Editorial serif
// headlines (Noto Serif Bengali / Noto Serif, scoped to the marketing layout),
// asymmetric alternating image/text sections, local trust-density (partner row,
// testimonials, 4-tier pricing, FAQ). All copy comes from the i18n dictionary.
export default async function MarketingHome() {
  const locale = await getMarketingLocale();
  const t = getMessages(locale);

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader t={t} locale={locale} />
      <main>
        <Hero t={t} />
        <Partners t={t} />
        <Features t={t} />
        <HowItWorks t={t} />
        <Testimonials t={t} />
        <Pricing t={t} locale={locale} />
        <Faq t={t} />
        <ClosingCta t={t} />
      </main>
      <SiteFooter t={t} locale={locale} />
    </div>
  );
}

/* ---------- Locale-aware numeral helper ---------- */

function digits(value: string | number, locale: Locale): string {
  return locale === "bn" ? toBnDigits(value) : String(value);
}

function formatPrice(amount: number, locale: Locale): string {
  const grouped = amount.toLocaleString("en-US");
  return `৳${digits(grouped, locale)}`;
}

/* ---------- Header ---------- */

function SiteHeader({ t, locale }: { t: MarketingMessages; locale: Locale }) {
  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-marketing items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight text-ink">
          Hybrid
        </Link>
        <nav aria-label={t.nav.features} className="hidden items-center gap-8 lg:flex">
          <HeaderLink href="#features">{t.nav.features}</HeaderLink>
          <HeaderLink href="#pricing">{t.nav.pricing}</HeaderLink>
          <HeaderLink href="#how">{t.nav.how}</HeaderLink>
          <HeaderLink href="#faq">{t.nav.faq}</HeaderLink>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <LangToggle
            locale={locale}
            toLabel={t.langToggle.toLabel}
            ariaLabel={t.langToggle.ariaLabel}
          />
          <Link href="/signup">
            <Button variant="primary" size="sm">
              {t.nav.cta}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="bn-body text-sm text-ink-muted transition-colors hover:text-ink">
      {children}
    </a>
  );
}

/* ---------- Hero (asymmetric: text left, mockup right) ---------- */

function Hero({ t }: { t: MarketingMessages }) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto max-w-marketing px-4 pb-section pt-12 sm:px-6 md:pt-20"
    >
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-cod-weak px-3 py-1 text-xs font-semibold text-cod">
            <span className="h-1.5 w-1.5 rounded-full bg-cod" aria-hidden="true" />
            {t.hero.badge}
          </span>
          <h1
            id="hero-heading"
            className="font-serif-display mt-6 text-4xl font-bold text-ink md:text-5xl lg:text-[3.5rem]"
          >
            {t.hero.titleLead}
            <br />
            <span className="text-primary">{t.hero.titleEmphasis}</span>
          </h1>
          <p className="bn-body mt-6 max-w-xl text-lg text-ink-muted">{t.hero.subcopy}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="sm:w-auto">
              <Button variant="primary" size="lg" fullWidth>
                {t.hero.ctaPrimary}
              </Button>
            </Link>
            <a href="#how" className="sm:w-auto">
              <Button variant="secondary" size="lg" fullWidth>
                {t.hero.ctaSecondary}
              </Button>
            </a>
          </div>
          <p className="bn-body mt-4 text-sm text-ink-subtle">{t.hero.reassurance}</p>
        </div>

        {/* Real storefront mockup, layered on a soft indigo plate. */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div
            aria-hidden="true"
            className="absolute -inset-4 -z-10 rounded-xl bg-primary-weak"
          />
          <MarketingImage
            src="/marketing/hero-storefront.webp"
            alt={t.hero.mockupAlt}
            width={880}
            height={980}
            priority
            className="shadow-lg"
          />
        </div>
      </div>
    </section>
  );
}

/* ---------- Partner trust row ---------- */

function Partners({ t }: { t: MarketingMessages }) {
  return (
    <section aria-label={`${t.partners.couriersLabel} · ${t.partners.paymentsLabel}`} className="border-y border-border bg-surface">
      <div className="mx-auto max-w-marketing px-4 py-10 sm:px-6">
        <PartnerLogos
          couriersLabel={t.partners.couriersLabel}
          paymentsLabel={t.partners.paymentsLabel}
        />
      </div>
    </section>
  );
}

/* ---------- Features (alternating image/text + benefit grid) ---------- */

function Features({ t }: { t: MarketingMessages }) {
  const f = t.features;
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mx-auto max-w-marketing px-4 py-section sm:px-6"
    >
      <div className="max-w-2xl">
        <h2 id="features-heading" className="font-serif-display text-3xl font-bold text-ink md:text-4xl">
          {f.heading}
        </h2>
        <p className="bn-body mt-4 text-lg text-ink-muted">{f.subcopy}</p>
      </div>

      {/* Wide alternating row 1: storefront — text left, image right */}
      <div className="mt-14 grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <h3 className="font-serif-display text-2xl font-bold text-ink md:text-3xl">
            {f.storefront.title}
          </h3>
          <p className="bn-body mt-4 text-base text-ink-muted">{f.storefront.body}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 font-latin text-sm text-ink-muted">
            <span className="h-2 w-2 rounded-full bg-cod" aria-hidden="true" />
            rahim.{ROOT}
          </p>
        </div>
        <MarketingImage
          src="/marketing/feature-store.webp"
          alt={f.storefront.imageAlt}
          width={1040}
          height={760}
        />
      </div>

      {/* Wide alternating row 2: admin — image left, text right */}
      <div className="mt-16 grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <MarketingImage
          src="/marketing/feature-admin.webp"
          alt={f.admin.imageAlt}
          width={1040}
          height={760}
          className="lg:order-1"
        />
        <div className="lg:order-2">
          <h3 className="font-serif-display text-2xl font-bold text-ink md:text-3xl">
            {f.admin.title}
          </h3>
          <p className="bn-body mt-4 text-base text-ink-muted">{f.admin.body}</p>
        </div>
      </div>

      {/* Benefit grid: payments / courier / isolation */}
      <div className="mt-16 grid gap-4 md:grid-cols-3">
        <BenefitCard title={f.payments.title} body={f.payments.body} accent="cod" />
        <BenefitCard title={f.courier.title} body={f.courier.body} accent="primary" />
        <BenefitCard title={f.isolation.title} body={f.isolation.body} accent="accent" />
      </div>
    </section>
  );
}

function BenefitCard({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent: "primary" | "cod" | "accent";
}) {
  const bar =
    accent === "cod" ? "bg-cod" : accent === "accent" ? "bg-accent" : "bg-primary";
  return (
    <article className="rounded-xl border border-border bg-surface p-6 transition-shadow duration-base ease-out-soft hover:shadow-md">
      <span className={`block h-1 w-10 rounded-full ${bar}`} aria-hidden="true" />
      <h3 className="bn-heading mt-4 text-lg font-bold text-ink">{title}</h3>
      <p className="bn-body mt-2 text-sm text-ink-muted">{body}</p>
    </article>
  );
}

/* ---------- How it works (editorial numbered rail) ---------- */

function HowItWorks({ t }: { t: MarketingMessages }) {
  return (
    <section id="how" aria-labelledby="how-heading" className="border-t border-border bg-surface-2">
      <div className="mx-auto max-w-marketing px-4 py-section sm:px-6">
        <div className="max-w-2xl">
          <h2 id="how-heading" className="font-serif-display text-3xl font-bold text-ink md:text-4xl">
            {t.how.heading}
          </h2>
          <p className="bn-body mt-4 text-lg text-ink-muted">{t.how.subcopy}</p>
        </div>
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {t.how.steps.map((s, i) => (
            <li key={s.n} className="relative">
              <span className="font-serif-display flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-ink-on-primary">
                {s.n}
              </span>
              {i < t.how.steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-14 top-7 hidden h-px w-[calc(100%-3.5rem)] bg-border-strong md:block"
                />
              ) : null}
              <h3 className="bn-heading mt-5 text-lg font-bold text-ink">{s.title}</h3>
              <p className="bn-body mt-2 text-sm text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Testimonials (static responsive grid) ---------- */

function Testimonials({ t }: { t: MarketingMessages }) {
  return (
    <section aria-labelledby="testimonials-heading" className="mx-auto max-w-marketing px-4 py-section sm:px-6">
      <div className="max-w-2xl">
        <h2 id="testimonials-heading" className="font-serif-display text-3xl font-bold text-ink md:text-4xl">
          {t.testimonials.heading}
        </h2>
        <p className="bn-body mt-4 text-lg text-ink-muted">{t.testimonials.subcopy}</p>
      </div>
      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {t.testimonials.items.map((item, i) => (
          <li
            key={item.name}
            className="flex flex-col rounded-xl border border-border bg-surface p-6 shadow-xs"
          >
            <blockquote className="bn-body flex-1 text-base text-ink">“{item.quote}”</blockquote>
            <div className="mt-5 flex items-center gap-3">
              <Avatar src={`/marketing/avatar-${i + 1}.webp`} alt={item.avatarAlt} />
              <div>
                <p className="bn-heading text-sm font-bold text-ink">{item.name}</p>
                <p className="bn-body text-xs text-ink-muted">{item.business}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Pricing (4 tiers from DB seed) ---------- */

function Pricing({ t, locale }: { t: MarketingMessages; locale: Locale }) {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="border-t border-border bg-surface-2">
      <div className="mx-auto max-w-marketing px-4 py-section sm:px-6">
        <div className="max-w-2xl">
          <h2 id="pricing-heading" className="font-serif-display text-3xl font-bold text-ink md:text-4xl">
            {t.pricing.heading}
          </h2>
          <p className="bn-body mt-4 text-lg text-ink-muted">{t.pricing.subcopy}</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.pricing.tiers.map((tier) => (
            <PriceCard
              key={tier.code}
              tier={tier}
              locale={locale}
              perMonth={t.pricing.perMonth}
              popularLabel={t.pricing.popularLabel}
            />
          ))}
        </div>
        <p className="bn-body mt-8 max-w-3xl text-sm text-ink-subtle">{t.pricing.note}</p>
      </div>
    </section>
  );
}

function PriceCard({
  tier,
  locale,
  perMonth,
  popularLabel,
}: {
  tier: PricingTier;
  locale: Locale;
  perMonth: string;
  popularLabel: string;
}) {
  const isFree = tier.priceBdt === 0;
  return (
    <article
      className={`relative flex flex-col rounded-xl border bg-surface p-6 ${
        tier.popular ? "border-primary shadow-md ring-1 ring-primary" : "border-border shadow-xs"
      }`}
    >
      {tier.popular ? (
        <span className="absolute -top-3 left-6 inline-flex rounded-full bg-primary px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-ink-on-primary">
          {popularLabel}
        </span>
      ) : null}
      <h3 className="bn-heading text-lg font-bold text-ink">{tier.name}</h3>
      <p className="bn-body mt-1 text-sm text-ink-muted">{tier.tagline}</p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="font-serif-display text-3xl font-bold text-ink">
          {isFree ? `৳${digits(0, locale)}` : formatPrice(tier.priceBdt, locale)}
        </span>
        {!isFree ? <span className="bn-body text-sm text-ink-muted">{perMonth}</span> : null}
      </div>
      <ul className="mt-6 flex-1 space-y-3">
        {tier.features.map((feature) => (
          <li key={feature} className="bn-body flex items-start gap-2 text-sm text-ink">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-cod"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link href="/signup" className="mt-6">
        <Button variant={tier.popular ? "primary" : "secondary"} size="md" fullWidth>
          {tier.cta}
        </Button>
      </Link>
    </article>
  );
}

/* ---------- FAQ ---------- */

function Faq({ t }: { t: MarketingMessages }) {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-section sm:px-6">
      <div className="text-center">
        <h2 id="faq-heading" className="font-serif-display text-3xl font-bold text-ink md:text-4xl">
          {t.faq.heading}
        </h2>
        <p className="bn-body mt-4 text-lg text-ink-muted">{t.faq.subcopy}</p>
      </div>
      <div className="mt-10">
        <FaqAccordion items={t.faq.items} />
      </div>
    </section>
  );
}

/* ---------- Closing CTA band ---------- */

function ClosingCta({ t }: { t: MarketingMessages }) {
  return (
    <section className="mx-auto max-w-marketing px-4 pb-section sm:px-6">
      <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-14 text-center md:px-12 md:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary-hover/50 blur-3xl"
        />
        <div className="relative">
          <h2 className="font-serif-display mx-auto max-w-2xl text-3xl font-bold text-ink-on-primary md:text-4xl">
            {t.closing.heading}
          </h2>
          <p className="bn-body mx-auto mt-4 max-w-md text-base text-primary-weak/90">
            {t.closing.subcopy}
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/signup">
              <Button variant="accent" size="lg">
                {t.closing.cta}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */

function SiteFooter({ t, locale }: { t: MarketingMessages; locale: Locale }) {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="mx-auto max-w-marketing px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xl font-bold text-ink">Hybrid</span>
            <p className="bn-body mt-2 max-w-xs text-sm text-ink-muted">{t.footer.tagline}</p>
          </div>
          <div className="bn-body space-y-2 text-sm text-ink-muted">
            <p className="inline-flex items-center gap-2">
              <PhoneIcon className="h-4 w-4" />
              {t.footer.madeFor}
            </p>
            <p>
              <span className="text-ink-subtle">{t.footer.contactLabel}: </span>
              <a href={`mailto:${t.footer.contact}`} className="font-latin hover:text-ink">
                {t.footer.contact}
              </a>
            </p>
            <p className="text-ink-subtle">{t.footer.langNote}</p>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-6">
          <p className="bn-body text-xs text-ink-subtle">
            © {digits(new Date().getFullYear(), locale)} Hybrid. {t.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
