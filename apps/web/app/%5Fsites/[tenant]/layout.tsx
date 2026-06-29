import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StoreHeader, StoreFooter } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";

interface StorefrontLayoutProps {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}

// Storefront shell (blueprint §7). Loads the tenant + published theme settings
// and applies the seller's full palette per-request as inline CSS variables on a
// wrapper — `bg-primary`, `text`, surfaces and background all track the active
// tenant's customizer colors without per-component props. (The draft-preview
// palette swap happens in page.tsx, which re-applies its own vars on the home
// route; the shell uses the published palette as the stable chrome.)
export default async function StorefrontLayout({
  children,
  params,
}: StorefrontLayoutProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const { locale } = await getDict();

  const c = ctx.settings.colors;
  // Override the brand vars the design tokens read from. Everything downstream
  // (buttons, links, focus, hero panel, surfaces) inherits these.
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
        <StoreHeader store={ctx.store} lang={locale} toggle={<LanguageToggle />} />
        {/* DBID verified trust badge — only shown when the seller has an approved DBID. */}
        {ctx.dbidVerified && (
          <div className="border-b border-border bg-success-weak">
            <div className="mx-auto flex max-w-6xl items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-success">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {locale === "bn" ? "বাংলাদেশ ডিজিটাল বিজনেস আইডি (DBID) যাচাইকৃত" : "Bangladesh Digital Business ID (DBID) Verified"}
            </div>
          </div>
        )}
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
