import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StoreHeader, StoreFooter } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";

interface WholesaleLayoutProps {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}

// Wholesale storefront shell. Mirrors the retail layout but with B2B nav
// elements. Applies the same tenant theme colors as the retail storefront.
export default async function WholesaleLayout({
  children,
  params,
}: WholesaleLayoutProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const { locale } = await getDict();

  const c = ctx.settings.colors;
  const themeStyle = {
    "--color-primary": c.primary,
    "--color-accent": c.accent,
    "--color-bg": c.background,
    "--color-surface": c.surface,
    "--color-text": c.text,
  } as React.CSSProperties;

  return (
    <LocaleProvider locale={locale}>
      <div style={themeStyle} className="flex min-h-screen flex-col bg-bg">
        {/* B2B top bar */}
        <div className="bg-primary px-4 py-1.5 text-center text-xs font-medium text-white">
          🏭 পাইকারি স্টোর — বাল্ক অর্ডার ও ব্যবসায়িক মূল্য
        </div>
        <StoreHeader store={ctx.store} lang={locale} toggle={<LanguageToggle />} />
        {/* B2B nav bar */}
        <nav className="overflow-x-auto border-b border-border bg-surface" aria-label="পাইকারি নেভিগেশন">
          <div className="flex min-w-max items-center gap-1 px-4 py-1 text-sm sm:gap-2">
            <a
              href="/wholesale"
              className="inline-flex min-h-[40px] items-center px-3 font-semibold text-primary hover:text-primary-hover"
            >
              পাইকারি পণ্য
            </a>
            <a
              href="/wholesale/cart"
              className="inline-flex min-h-[40px] items-center px-3 text-ink-muted hover:text-ink"
            >
              কার্ট
            </a>
            <a
              href="/wholesale/checkout"
              className="inline-flex min-h-[40px] items-center px-3 text-ink-muted hover:text-ink"
            >
              চেকআউট
            </a>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <StoreFooter
          store={ctx.store}
          lang={locale}
          poweredByHref={
            process.env.NEXT_PUBLIC_ROOT_DOMAIN
              ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
              : undefined
          }
        />
      </div>
    </LocaleProvider>
  );
}
