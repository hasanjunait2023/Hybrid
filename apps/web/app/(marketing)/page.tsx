import Link from "next/link";
import { Button, toBnDigits, PhoneIcon } from "@hybrid/ui";
import { getMarketingLocale } from "../../lib/i18n/locale";
import { adminLoginUrl } from "../../lib/auth/urls";
import {
  getMessages,
  type Locale,
  type MarketingMessages,
  type PricingTier,
} from "../../lib/i18n/marketing";
import { HybridLogo } from "./_components/HybridLogo";
import { LangToggle } from "./_components/LangToggle";
import { MobileMenu } from "./_components/MobileMenu";
import { FaqAccordion } from "./_components/FaqAccordion";
import { PartnerLogos } from "./_components/PartnerLogos";
import { MarketingImage } from "./_components/MarketingImage";
import { Avatar } from "./_components/Avatar";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

// Hybrid marketing landing — "Bazaar Modern" showroom (DESIGN §2): persuasive,
// confident, Bengali, spacious. Bengali-default with an EN/BN cookie toggle
// resolved server-side (no hydration flash). The signature is dramatic SCALE
// CONTRAST: small tracked Latin eyebrows against oversized Hind Siliguri
// headlines. Warm paper trust bands alternate with FLAT INDIGO bands (hero +
// closing, DESIGN §6.2); marigold carries the energy. All copy comes from the
// i18n dictionary; all motion is compositor-friendly and gated behind
// prefers-reduced-motion.
export default async function MarketingHome() {
  const locale = await getMarketingLocale();
  const t = getMessages(locale);
  const loginUrl = await adminLoginUrl();

  return (
    <div className="min-h-screen bg-bg">
      <div className="brand-topline" aria-hidden="true" />
      <SiteHeader t={t} locale={locale} loginUrl={loginUrl} />
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

/* ---------- Locale-aware numeral helpers ---------- */

function digits(value: string | number, locale: Locale): string {
  return locale === "bn" ? toBnDigits(value) : String(value);
}

function formatPrice(amount: number, locale: Locale): string {
  const grouped = amount.toLocaleString("en-US");
  return `৳${digits(grouped, locale)}`;
}

/* Small all-caps tracked eyebrow — the counterweight to the huge headlines. */
function Eyebrow({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "onInk";
}) {
  const color = tone === "onInk" ? "text-accent" : "text-primary";
  return <p className={`eyebrow ${color}`}>{children}</p>;
}

/* ---------- Header ---------- */

function SiteHeader({
  t,
  locale,
  loginUrl,
}: {
  t: MarketingMessages;
  locale: Locale;
  loginUrl: string;
}) {
  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-marketing items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Hybrid" className="-m-1 inline-flex p-1">
          <HybridLogo variant="lockup" />
        </Link>
        <nav aria-label={t.nav.features} className="hidden items-center gap-9 lg:flex">
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
          <a
            href={loginUrl}
            className="bn-body hidden text-sm font-medium text-ink-muted transition-colors hover:text-primary lg:block"
          >
            {t.nav.login}
          </a>
          <Link href="/signup" className="cta-glow hidden lg:block">
            <Button variant="primary" size="sm">
              {t.nav.cta}
            </Button>
          </Link>
          <MobileMenu
            links={[
              { href: "#features", label: t.nav.features },
              { href: "#pricing", label: t.nav.pricing },
              { href: "#how", label: t.nav.how },
              { href: "#faq", label: t.nav.faq },
            ]}
            loginUrl={loginUrl}
            loginLabel={t.nav.login}
            ctaHref="/signup"
            ctaLabel={t.nav.cta}
            menuLabel="মেনু"
            closeLabel="বন্ধ করুন"
          />
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="bn-body text-sm font-medium text-ink-muted transition-colors hover:text-primary"
    >
      {children}
    </a>
  );
}

/* ---------- Hero — dark ink band, asymmetric, orchestrated reveal ---------- */

function Hero({ t }: { t: MarketingMessages }) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="ink-band on-ink"
    >
      <div className="mx-auto grid max-w-marketing items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:pb-28 md:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        {/* Left: oversized editorial headline + CTAs. */}
        <div className="relative z-10">
          <div className="reveal" style={{ ["--reveal-delay" as string]: "0ms" }}>
            <Eyebrow tone="onInk">{t.tagline}</Eyebrow>
          </div>
          <div
            className="reveal mt-5"
            style={{ ["--reveal-delay" as string]: "80ms" }}
          >
            <span className="bn-body inline-flex items-center rounded-full bg-cod-weak px-3 py-1 text-xs font-semibold text-cod">
              {t.hero.badge}
            </span>
          </div>
          <h1
            id="hero-heading"
            className="font-serif-display display-hero reveal mt-6 text-ink-on-primary"
            style={{ ["--reveal-delay" as string]: "150ms" }}
          >
            {t.hero.titleLead}{" "}
            <span className="display-emphasis text-accent">
              {t.hero.titleEmphasis}
            </span>
          </h1>
          <p
            className="bn-body reveal mt-7 max-w-xl text-lg leading-relaxed ink-muted"
            style={{ ["--reveal-delay" as string]: "240ms" }}
          >
            {t.hero.subcopy}
          </p>
          <div
            className="reveal mt-9 flex flex-col gap-3 sm:flex-row"
            style={{ ["--reveal-delay" as string]: "320ms" }}
          >
            <Link href="/signup" className="cta-on-band sm:w-auto">
              <Button variant="primary" size="lg" fullWidth>
                {t.hero.ctaPrimary}
              </Button>
            </Link>
            <a href="#how" className="btn-on-ink w-full sm:w-auto">
              {t.hero.ctaSecondary}
            </a>
          </div>
          <p
            className="bn-body reveal mt-5 text-sm ink-subtle"
            style={{ ["--reveal-delay" as string]: "400ms" }}
          >
            {t.hero.reassurance}
          </p>
        </div>

        {/* Right: storefront mock, offset + overlapping its container. */}
        <div
          className="reveal relative mx-auto w-full max-w-sm lg:max-w-none lg:translate-x-6"
          style={{ ["--reveal-delay" as string]: "320ms" }}
        >
          <div className="frame-shadow float-slow relative overflow-hidden rounded-2xl border border-white/15 lg:-mt-6 lg:-rotate-1">
            <MarketingImage
              src="/marketing/hero-storefront.webp"
              alt={t.hero.mockupAlt}
              width={880}
              height={980}
              priority
              rounded="lg"
              className="!border-0"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Partner trust row ---------- */

function Partners({ t }: { t: MarketingMessages }) {
  return (
    <section
      aria-label={`${t.partners.couriersLabel} · ${t.partners.paymentsLabel}`}
      className="border-b border-border bg-surface"
    >
      <div className="mx-auto max-w-marketing px-4 py-12 sm:px-6">
        <PartnerLogos
          couriersLabel={t.partners.couriersLabel}
          paymentsLabel={t.partners.paymentsLabel}
        />
      </div>
    </section>
  );
}

/* ---------- Features (asymmetric editorial rows + bento benefit grid) ---------- */

function Features({ t }: { t: MarketingMessages }) {
  const f = t.features;
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mx-auto max-w-marketing px-4 py-section sm:px-6"
    >
      <div className="max-w-2xl">
        <Eyebrow>{t.nav.features}</Eyebrow>
        <h2
          id="features-heading"
          className="font-serif-display display-section mt-4 text-ink"
        >
          {f.heading}
        </h2>
        <p className="bn-body mt-5 text-lg text-ink-muted">{f.subcopy}</p>
      </div>

      {/* Row 1: storefront — text left, image right, image breaks wider. */}
      <div className="mt-16 grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div>
          <h3 className="font-serif-display text-2xl text-ink md:text-3xl">
            {f.storefront.title}
          </h3>
          <p className="bn-body mt-4 text-base leading-relaxed text-ink-muted">
            {f.storefront.body}
          </p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-cod/30 bg-cod-weak px-3.5 py-1.5 font-latin text-sm font-medium text-cod">
            <span className="h-2 w-2 rounded-full bg-cod" aria-hidden="true" />
            rahim.{ROOT}
          </p>
        </div>
        <div className="frame-shadow overflow-hidden rounded-2xl">
          <MarketingImage
            src="/marketing/feature-store.webp"
            alt={f.storefront.imageAlt}
            width={1040}
            height={760}
            priority
            className="!border-0"
          />
        </div>
      </div>

      {/* Row 2: admin — image left, text right. */}
      <div className="mt-20 grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div className="frame-shadow overflow-hidden rounded-2xl lg:order-1">
          <MarketingImage
            src="/marketing/feature-admin.webp"
            alt={f.admin.imageAlt}
            width={1040}
            height={760}
            className="!border-0"
          />
        </div>
        <div className="lg:order-2">
          <h3 className="font-serif-display text-2xl text-ink md:text-3xl">
            {f.admin.title}
          </h3>
          <p className="bn-body mt-4 text-base leading-relaxed text-ink-muted">
            {f.admin.body}
          </p>
        </div>
      </div>

      {/* Bento benefit grid — grid-breaking: payments spans wide. */}
      <div className="mt-20 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <BenefitCard
          title={f.payments.title}
          body={f.payments.body}
          accent="cod"
          className="lg:col-span-2"
        />
        <BenefitCard title={f.courier.title} body={f.courier.body} accent="primary" />
        <BenefitCard
          title={f.isolation.title}
          body={f.isolation.body}
          accent="accent"
          className="md:col-span-2 lg:col-span-3"
        />
      </div>
    </section>
  );
}

function BenefitCard({
  title,
  body,
  accent,
  className = "",
}: {
  title: string;
  body: string;
  accent: "primary" | "cod" | "accent";
  className?: string;
}) {
  const bar =
    accent === "cod" ? "bg-cod" : accent === "accent" ? "bg-accent" : "bg-primary";
  return (
    <article
      className={`lift-card rounded-2xl border border-border bg-surface p-7 ${className}`}
    >
      <span className={`block h-1.5 w-12 rounded-full ${bar}`} aria-hidden="true" />
      <h3 className="bn-heading mt-5 text-lg font-bold text-ink">{title}</h3>
      <p className="bn-body mt-2.5 text-sm leading-relaxed text-ink-muted">{body}</p>
    </article>
  );
}

/* ---------- How it works — ghosted oversized editorial numerals ---------- */

function HowItWorks({ t }: { t: MarketingMessages }) {
  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="border-y border-border bg-surface-2"
    >
      <div className="mx-auto max-w-marketing px-4 py-section sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>{t.nav.how}</Eyebrow>
          <h2
            id="how-heading"
            className="font-serif-display display-section mt-4 text-ink"
          >
            {t.how.heading}
          </h2>
          <p className="bn-body mt-5 text-lg text-ink-muted">{t.how.subcopy}</p>
        </div>
        <ol className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          {t.how.steps.map((s) => (
            <li key={s.n} className="relative pt-6">
              <span
                className="ghost-numeral pointer-events-none absolute -left-2 -top-6 -z-0"
                aria-hidden="true"
              >
                {s.n}
              </span>
              <div className="relative">
                <span className="font-serif-display inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-xl text-ink-on-primary shadow-md">
                  {s.n}
                </span>
                <h3 className="bn-heading mt-5 text-xl font-bold text-ink">{s.title}</h3>
                <p className="bn-body mt-2.5 text-base leading-relaxed text-ink-muted">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Testimonials ---------- */

function Testimonials({ t }: { t: MarketingMessages }) {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="mx-auto max-w-marketing px-4 py-section sm:px-6"
    >
      <div className="max-w-2xl">
        <Eyebrow>{t.testimonials.heading}</Eyebrow>
        <h2
          id="testimonials-heading"
          className="font-serif-display display-section mt-4 text-ink"
        >
          {t.testimonials.subcopy}
        </h2>
      </div>
      <ul className="mt-14 grid gap-5 md:grid-cols-3">
        {t.testimonials.items.map((item, i) => (
          <li
            key={item.name}
            className={`lift-card flex flex-col rounded-2xl border border-border bg-surface p-7 ${
              i === 0 ? "md:mt-0" : i === 1 ? "md:mt-8" : "md:mt-4"
            }`}
          >
            <span
              className="font-serif-display text-5xl leading-none text-primary/25"
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <blockquote className="bn-body -mt-3 flex-1 text-lg leading-relaxed text-ink">
              {item.quote}
            </blockquote>
            <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
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

/* ---------- Pricing — popular card lifts + glows ---------- */

function Pricing({ t, locale }: { t: MarketingMessages; locale: Locale }) {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="border-y border-border bg-surface-2"
    >
      <div className="mx-auto max-w-marketing px-4 py-section sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>{t.nav.pricing}</Eyebrow>
          <h2
            id="pricing-heading"
            className="font-serif-display display-section mt-4 text-ink"
          >
            {t.pricing.heading}
          </h2>
          <p className="bn-body mt-5 text-lg text-ink-muted">{t.pricing.subcopy}</p>
        </div>
        <div className="mt-14 grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="bn-body mt-10 max-w-3xl text-sm text-ink-subtle">{t.pricing.note}</p>
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
      className={`relative flex flex-col rounded-2xl border bg-surface p-7 ${
        tier.popular ? "pop-card" : "lift-card border-border shadow-xs"
      }`}
    >
      {tier.popular ? (
        <span className="eyebrow absolute -top-3 left-7 inline-flex rounded-full bg-primary px-3 py-1 text-2xs text-ink-on-primary shadow-md">
          {popularLabel}
        </span>
      ) : null}
      <h3 className="bn-heading text-lg font-bold text-ink">{tier.name}</h3>
      <p className="bn-body mt-1 text-sm text-ink-muted">{tier.tagline}</p>
      <div className="mt-6 flex items-baseline gap-1">
        <span className="font-serif-display text-4xl text-ink">
          {isFree ? `৳${digits(0, locale)}` : formatPrice(tier.priceBdt, locale)}
        </span>
        {!isFree ? <span className="bn-body text-sm text-ink-muted">{perMonth}</span> : null}
      </div>
      <ul className="mt-7 flex-1 space-y-3.5">
        {tier.features.map((feature) => (
          <li key={feature} className="bn-body flex items-start gap-2.5 text-sm text-ink">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
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
      <Link href="/signup" className={`mt-7 ${tier.popular ? "cta-glow" : ""}`}>
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
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto max-w-3xl px-4 py-section sm:px-6"
    >
      <div className="text-center">
        <Eyebrow>{t.nav.faq}</Eyebrow>
        <h2
          id="faq-heading"
          className="font-serif-display display-section mt-4 text-ink"
        >
          {t.faq.heading}
        </h2>
        <p className="bn-body mt-5 text-lg text-ink-muted">{t.faq.subcopy}</p>
      </div>
      <div className="mt-12">
        <FaqAccordion items={t.faq.items} />
      </div>
    </section>
  );
}

/* ---------- Closing CTA — dark ink band, recurring logo motif ---------- */

function ClosingCta({ t }: { t: MarketingMessages }) {
  return (
    <section className="mx-auto max-w-marketing px-4 pb-section sm:px-6">
      <div className="ink-band on-ink relative rounded-3xl px-6 py-16 text-center md:px-12 md:py-24">
        <div className="relative z-10">
          <div className="mb-7 flex justify-center">
            <HybridLogo variant="lockup" tone="onDark" className="float-slow" />
          </div>
          <h2 className="font-serif-display display-section mx-auto max-w-2xl text-white">
            {t.closing.heading}
          </h2>
          <p className="bn-body mx-auto mt-5 max-w-md text-lg ink-muted">
            {t.closing.subcopy}
          </p>
          <div className="mt-9 flex justify-center">
            <Link href="/signup" className="cta-on-band">
              <Button variant="primary" size="lg">
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
      <div className="mx-auto max-w-marketing px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <HybridLogo variant="full" tagline={t.tagline} />
            <p className="bn-body mt-3 max-w-xs text-sm text-ink-muted">{t.footer.tagline}</p>
          </div>
          <div className="bn-body space-y-2 text-sm text-ink-muted">
            <p className="inline-flex items-center gap-2">
              <PhoneIcon className="h-4 w-4" />
              {t.footer.madeFor}
            </p>
            <p>
              <span className="text-ink-subtle">{t.footer.contactLabel}: </span>
              <a href={`mailto:${t.footer.contact}`} className="font-latin hover:text-primary">
                {t.footer.contact}
              </a>
            </p>
            <p className="text-ink-subtle">{t.footer.langNote}</p>
          </div>
        </div>
        <div className="hairline mt-10" aria-hidden="true" />
        <p className="bn-body mt-6 text-xs text-ink-subtle">
          © {digits(new Date().getFullYear(), locale)} Hybrid. {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
