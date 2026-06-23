import Link from "next/link";
import {
  Button,
  toBnDigits,
  TruckIcon,
  ShieldIcon,
  BkashIcon,
  BoxesIcon,
  ChatIcon,
  PhoneIcon,
} from "@hybrid/ui";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

// Marketing home (apex / www) — blueprint W3 S-MARKETING. Bazaar Modern, Bengali
// -first, mobile-first. Sells a Bangladeshi seller the full loop: live storefront
// on a subdomain, COD + bKash, courier booking, a Bengali admin. Editorial, not a
// centered-hero-with-gradient-blob template (DESIGN §9 anti-slop): asymmetric
// hero with a live storefront-address proof, an offset bento of capabilities, a
// COD-green trust band, a numbered "how it works" rail, and a warm closing CTA.
export default function MarketingHome() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main>
        <Hero />
        <TrustStrip />
        <Capabilities />
        <HowItWorks />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-marketing items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-ink">
          Hybrid
        </Link>
        <nav aria-label="মূল মেনু" className="hidden items-center gap-7 md:flex">
          <a href="#features" className="bn-body text-sm text-ink-muted hover:text-ink">
            যা যা পাবেন
          </a>
          <a href="#how" className="bn-body text-sm text-ink-muted hover:text-ink">
            কীভাবে কাজ করে
          </a>
        </nav>
        <Link href="/signup">
          <Button variant="primary" size="sm">
            দোকান খুলুন
          </Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto max-w-marketing px-4 pb-section pt-12 md:pt-20"
    >
      <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-cod-weak px-3 py-1 text-xs font-semibold text-cod">
            <span className="h-1.5 w-1.5 rounded-full bg-cod" aria-hidden="true" />
            ক্যাশ অন ডেলিভারি রেডি
          </span>
          <h1
            id="hero-heading"
            className="bn-heading mt-5 text-4xl font-bold leading-bangla-tight text-ink"
          >
            ফেসবুক পেজ থেকে
            <br />
            <span className="text-primary">সত্যিকারের অনলাইন দোকান</span>
          </h1>
          <p className="bn-body mt-5 max-w-xl text-lg text-ink-muted">
            নিজের ঠিকানায় লাইভ স্টোরফ্রন্ট, ক্যাশ অন ডেলিভারি ও bKash, আর কুরিয়ারে
            এক ক্লিকে পার্সেল বুকিং — সবকিছু বাংলায়, একই জায়গায়।
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="sm:w-auto">
              <Button variant="primary" size="lg" fullWidth>
                বিনামূল্যে শুরু করুন
              </Button>
            </Link>
            <a href="#how" className="sm:w-auto">
              <Button variant="secondary" size="lg" fullWidth>
                কীভাবে কাজ করে
              </Button>
            </a>
          </div>
          <p className="bn-body mt-4 text-sm text-ink-subtle">
            ১৪ দিন ফ্রি ট্রায়াল · কার্ড লাগবে না
          </p>
        </div>

        {/* Visual proof: a mock storefront card on the seller's own address */}
        <StorefrontPreview />
      </div>
    </section>
  );
}

// Layered "your store is live" proof panel. Concrete > abstract: shows the
// seller their own subdomain with a product and a COD badge, the exact thing
// they're buying. Pure presentation, no fake data shipped to a real surface.
function StorefrontPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-xl bg-primary-weak"
      />
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
          <span className="font-latin text-xs text-ink-muted">rahim.{ROOT}</span>
        </div>
        <div className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="bn-heading text-base font-bold text-ink">রহিমের ফ্যাশন</span>
            <span className="rounded-full bg-cod-weak px-2 py-0.5 text-2xs font-semibold text-cod">
              ক্যাশ অন ডেলিভারি
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <PreviewProduct name="পাঞ্জাবি" price={1290} sale />
            <PreviewProduct name="শাড়ি" price={2450} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewProduct({
  name,
  price,
  sale = false,
}: {
  name: string;
  price: number;
  sale?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="flex aspect-square items-center justify-center rounded-md bg-surface-2">
        <BoxesIcon className="h-8 w-8 text-ink-subtle" />
      </div>
      <p className="bn-body mt-2 text-sm font-medium text-ink">{name}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="bn-body text-sm font-bold text-ink">৳{toBnDigits(price.toLocaleString("en-US"))}</span>
        {sale ? (
          <span className="rounded bg-accent-weak px-1.5 py-0.5 text-2xs font-semibold text-accent-hover">
            অফার
          </span>
        ) : null}
      </div>
    </div>
  );
}

// COD-green trust band — the dedicated trust signal the design system mandates
// stays visible (DESIGN). Bangla numerals for customer-facing metrics.
function TrustStrip() {
  return (
    <section className="border-y border-border bg-cod-weak">
      <div className="mx-auto grid max-w-marketing grid-cols-2 gap-px overflow-hidden md:grid-cols-4">
        <TrustStat value="৪+" label="কুরিয়ার নেটওয়ার্ক" />
        <TrustStat value="১৪ দিন" label="ফ্রি ট্রায়াল" />
        <TrustStat value="bKash" label="ও ক্যাশ অন ডেলিভারি" />
        <TrustStat value="০ টাকা" label="শুরু করতে খরচ" />
      </div>
    </section>
  );
}

function TrustStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-cod-weak px-4 py-6 text-center">
      <p className="bn-heading text-2xl font-bold text-cod">{value}</p>
      <p className="bn-body mt-1 text-xs text-ink-muted">{label}</p>
    </div>
  );
}

// Asymmetric bento: one wide feature carries the storefront story, three compact
// cards carry payments/courier/admin. Breaks the uniform 3-col grid (anti-slop).
function Capabilities() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mx-auto max-w-marketing px-4 py-section"
    >
      <div className="max-w-2xl">
        <h2 id="features-heading" className="bn-heading text-3xl font-bold text-ink">
          একটা দোকান চালাতে যা যা লাগে
        </h2>
        <p className="bn-body mt-3 text-lg text-ink-muted">
          আলাদা আলাদা টুল নয় — অর্ডার, পেমেন্ট, ডেলিভারি সব এক জায়গায়।
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3 md:grid-rows-2">
        <FeatureCard
          wide
          icon={<BoxesIcon className="h-6 w-6" />}
          title="নিজের ঠিকানায় লাইভ স্টোরফ্রন্ট"
          body={`rahim.${ROOT} এর মতো নিজের সাবডোমেইনে মোবাইল-ফার্স্ট বাংলা দোকান। পণ্য যোগ করুন, ছবি দিন, মুহূর্তেই লাইভ। পরে নিজের কাস্টম ডোমেইনও যুক্ত করা যাবে।`}
        />
        <FeatureCard
          icon={<BkashIcon className="h-6 w-6" />}
          title="bKash ও ক্যাশ অন ডেলিভারি"
          body="গ্রাহক যেভাবে স্বচ্ছন্দ, সেভাবেই পেমেন্ট — bKash, নগদ বা হাতে হাতে।"
        />
        <FeatureCard
          icon={<TruckIcon className="h-6 w-6" />}
          title="কুরিয়ারে এক ক্লিকে বুকিং"
          body="স্টেডফাস্টসহ দেশের কুরিয়ার নেটওয়ার্কে সরাসরি পার্সেল বুক করুন।"
        />
        <FeatureCard
          icon={<ChatIcon className="h-6 w-6" />}
          title="পুরো অ্যাডমিন বাংলায়"
          body="অর্ডার, স্টক, গ্রাহক — সবকিছু পরিচালনা করুন আপনার ভাষায়, মোবাইলেই।"
        />
        <FeatureCard
          icon={<ShieldIcon className="h-6 w-6" />}
          title="নিরাপদ ও নির্ভরযোগ্য"
          body="প্রতিটি দোকানের তথ্য আলাদা ও সুরক্ষিত — আপনার ডেটা শুধু আপনারই।"
        />
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  wide = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  wide?: boolean;
}) {
  return (
    <article
      className={[
        "group rounded-lg border border-border bg-surface p-6 transition-shadow duration-base ease-out-soft hover:shadow-md",
        wide ? "md:col-span-1 md:row-span-2 md:flex md:flex-col" : "",
      ].join(" ")}
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-primary-weak text-primary">
        {icon}
      </span>
      <h3 className="bn-heading mt-4 text-lg font-bold text-ink">{title}</h3>
      <p className="bn-body mt-2 text-sm text-ink-muted">{body}</p>
    </article>
  );
}

// Numbered process rail with a connecting hairline — editorial, not 3 floating
// cards. Three steps from signup to first order.
function HowItWorks() {
  const steps = [
    {
      n: "১",
      title: "দোকান খুলুন",
      body: "নাম আর ঠিকানা দিন — মিনিটেই আপনার দোকান লাইভ।",
    },
    {
      n: "২",
      title: "পণ্য যোগ করুন",
      body: "ছবি, দাম আর বিবরণ দিয়ে পণ্য সাজান — মোবাইল থেকেই।",
    },
    {
      n: "৩",
      title: "অর্ডার নিন, ডেলিভারি দিন",
      body: "গ্রাহক অর্ডার করুক, আপনি কুরিয়ারে বুক করে দিন।",
    },
  ];
  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="border-t border-border bg-surface-2"
    >
      <div className="mx-auto max-w-marketing px-4 py-section">
        <h2 id="how-heading" className="bn-heading text-3xl font-bold text-ink">
          তিন ধাপে শুরু
        </h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.n} className="relative">
              <span className="bn-heading flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-ink-on-primary">
                {s.n}
              </span>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-12 top-6 hidden h-px w-[calc(100%-3rem)] bg-border-strong md:block"
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

function ClosingCta() {
  return (
    <section className="mx-auto max-w-marketing px-4 py-section">
      <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-12 text-center md:px-12 md:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary-hover/50 blur-3xl"
        />
        <div className="relative">
          <h2 className="bn-heading mx-auto max-w-xl text-3xl font-bold text-ink-on-primary">
            আজই খুলুন আপনার অনলাইন দোকান
          </h2>
          <p className="bn-body mx-auto mt-3 max-w-md text-base text-primary-weak/90">
            ১৪ দিন ফ্রি — কোনো কার্ড লাগবে না।
          </p>
          <div className="mt-7 flex justify-center">
            <Link href="/signup">
              <Button variant="accent" size="lg">
                বিনামূল্যে শুরু করুন
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="mx-auto flex max-w-marketing flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-base font-bold text-ink">Hybrid</span>
        <p className="bn-body inline-flex items-center gap-2 text-sm text-ink-muted">
          <PhoneIcon className="h-4 w-4" />
          বাংলাদেশের সেলারদের জন্য তৈরি
        </p>
        <p className="bn-body text-xs text-ink-subtle">
          © {toBnDigits(new Date().getFullYear())} Hybrid
        </p>
      </div>
    </footer>
  );
}
