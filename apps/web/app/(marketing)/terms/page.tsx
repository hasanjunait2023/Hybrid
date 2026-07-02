import type { Metadata } from "next";
import Link from "next/link";
import { getMarketingLocale } from "../../../lib/i18n/locale";
import { getMessages } from "../../../lib/i18n/marketing";
import { HybridLogo } from "../_components/HybridLogo";
import { LangToggle } from "../_components/LangToggle";

export const metadata: Metadata = {
  title: "Terms of Service — Hybrid",
  description:
    "Terms and conditions for using the Hybrid commerce platform.",
};

export default async function TermsPage() {
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
        <h1 className="font-serif-display text-3xl text-ink">Terms of Service</h1>
        <p className="bn-body mt-2 text-sm text-ink-muted">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <section className="bn-body mt-10 space-y-6 text-ink">
          <p>
            These Terms of Service ("Terms") govern your access to and use of the
            Hybrid platform, operated under the domain{" "}
            <strong>hybrid.ecomex.cloud</strong> and on seller-managed custom
            domains. By creating an account or using the service, you agree to these
            Terms.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">1. Use of the Platform</h2>
          <p>
            Hybrid provides tools to create online storefronts, manage products,
            process orders, and coordinate payments and couriers. You may use the
            platform only for lawful business purposes and in compliance with all
            applicable laws in Bangladesh.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">2. Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account
            credentials and for all activity that occurs under your account. Notify us
            immediately of any unauthorized use.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">3. Seller Responsibilities</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Accurate product listings, pricing, and inventory.</li>
            <li>Timely order fulfillment and customer communication.</li>
            <li>Compliance with tax, consumer protection, and data-protection obligations.</li>
            <li>No sale of prohibited or illegal goods.</li>
          </ul>

          <h2 className="font-serif-display mt-8 text-xl text-ink">4. Payments</h2>
          <p>
            Subscription and transaction fees are described on the pricing page.
            Payment gateway and courier charges are separate and billed directly by
            those providers according to their terms.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">5. Intellectual Property</h2>
          <p>
            Hybrid retains ownership of its software, branding, and platform content.
            Sellers retain ownership of their own product images, descriptions, and
            customer data.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">6. Termination</h2>
          <p>
            We may suspend or terminate accounts that violate these Terms, fail to pay
            fees, or engage in fraudulent activity. You may close your account at any
            time by contacting support.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">7. Limitation of Liability</h2>
          <p>
            Hybrid is provided "as is" without warranties of any kind. We are not
            liable for indirect, incidental, or consequential damages arising from
            your use of the platform, to the extent permitted by law.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">8. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use after changes
            means you accept the revised Terms.
          </p>

          <h2 className="font-serif-display mt-8 text-xl text-ink">9. Contact</h2>
          <p>
            For questions about these Terms, email{" "}
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
