import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StoreHeader, StoreFooter } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getDict } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { getPublicAnalyticsIds } from "@/lib/analytics/config";
import { StorefrontTracker } from "@/app/_components/StorefrontTracker";
import { readConsentFromCookieHeader } from "@/lib/analytics/consent";
import { cookies } from "next/headers";

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

  const publicIds = await getPublicAnalyticsIds(ctx.id, null);
  const consent = readConsentFromCookieHeader((await cookies()).toString());

  return (
    <LocaleProvider locale={locale}>
      <div style={themeStyle} className="flex min-h-screen flex-col bg-bg">
        <StorefrontTracker
          ids={{
            ga4MeasurementId: publicIds.ga4MeasurementId,
            fbPixelId: publicIds.fbPixelId,
            tiktokPixelId: publicIds.tiktokPixelId,
          }}
          consent={consent.categories.analytics ?? true}
        />
        <StoreHeader store={ctx.store} lang={locale} toggle={<LanguageToggle />} />
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
