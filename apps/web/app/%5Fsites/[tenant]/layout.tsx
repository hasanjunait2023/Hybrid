import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StoreHeader, StoreFooter } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";

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
    <div style={themeStyle} className="flex min-h-screen flex-col bg-bg">
      <StoreHeader store={ctx.store} />
      <main className="flex-1">{children}</main>
      <StoreFooter store={ctx.store} />
    </div>
  );
}
