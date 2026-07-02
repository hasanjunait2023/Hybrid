import type { Metadata } from "next";
import Link from "next/link";
import { getMarketingLocale } from "../../../lib/i18n/locale";
import { getMessages } from "../../../lib/i18n/marketing";
import { HybridLogo } from "../_components/HybridLogo";
import { LangToggle } from "../_components/LangToggle";

export const metadata: Metadata = {
  title: "Privacy Policy — Hybrid",
  description:
    "How Hybrid collects, uses, and protects your data. Built for Bangladeshi sellers and buyers.",
};

export default async function PrivacyPage() {
  const locale = await getMarketingLocale();
  const t = getMessages(locale);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex h-16 max-w-marketing items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Hybrid" className="-m-1 inline-flex p-1">
            <HybridLogo variant="lockup" />
          </Link>
          <LangToggle
            locale={locale}
            toLabel={t.langToggle.toLabel}
            ariaLabel={t.langToggle.ariaLabel}
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="font-serif-display text-3xl text-ink">Privacy Policy</h1>
        <p className="bn-body mt-2 text-sm text-ink-muted">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <section className="bn-body mt-10 space-y-6 text-ink">
          <p>
            Hybrid ("we", "us", or "our") operates the multi-tenant commerce platform
            available at <strong>hybrid.ecomex.cloud</strong> and on custom domains pointed
            by our sellers. This Privacy Policy explains how we collect, use, disclose,
            and safeguard your information when you visit a Hybrid-powered storefront,
            admin panel, or marketing page.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">1. Information We Collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Account information:</strong> name, email address, phone number,
              and password hash when you create an account.
            </li>
            <li>
              <strong>Store and order data:</strong> product catalog, inventory,
              orders, customer addresses, and payment/shipping details processed by
              sellers.
            </li>
            <li>
              <strong>Usage data:</strong> IP address, browser type, pages visited,
              and device information via cookies and analytics.
            </li>
            <li>
              <strong>Communications:</strong> SMS, WhatsApp, and email content
              sent through platform integrations.
            </li>
          </ul>

          <h2 className="font-serif-display mt-8 text-xl text-ink">2. How We Use Your Information</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide and maintain the platform and individual storefronts.</li>
            <li>Process orders, payments, and courier bookings.</li>
            <li>Send order updates, OTPs, and marketing messages (with consent).</li>
            <li>Improve security, detect fraud, and analyze usage trends.</li>
          </ul>

          <h2 className="font-serif-display mt-8 text-xl text-ink">3. Data Sharing</h2>
          <p>
            We share data only when necessary: with courier partners for delivery,
            payment gateways for transactions, and service providers hosting the
            platform. We do not sell personal information.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">4. Cookies & Tracking</h2>
          <p>
            We use cookies for session management, language preference, and analytics.
            You can disable cookies in your browser, but some features may not work.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">5. Security</h2>
          <p>
            We encrypt credentials at rest, use HTTPS everywhere, and apply row-level
            tenant isolation in the database. Sellers are responsible for keeping their
            staff accounts secure.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">6. Contact Us</h2>
          <p>
            For privacy questions, contact us at{" "}
            <a href="mailto:support@ecomex.cloud" className="text-primary hover:underline">
              support@ecomex.cloud
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-border bg-bg">
        <div className="mx-auto max-w-marketing px-4 py-8 sm:px-6">
          <p className="bn-body text-sm text-ink-subtle">
            © {new Date().getFullYear()} Hybrid.{" "}
            <Link href="/privacy" className="hover:text-primary">Privacy Policy</Link>
            {" · "}
            <Link href="/terms" className="hover:text-primary">Terms of Service</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
