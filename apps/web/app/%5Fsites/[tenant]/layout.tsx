import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StoreHeader, StoreFooter } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";

interface StorefrontLayoutProps {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}

// Storefront shell (blueprint §7). Loads the tenant + active theme settings and
// applies the tenant accent per-request as inline CSS variables on a wrapper —
// `bg-primary`, `text-primary`, focus ring, etc. all track the active tenant
// (Store A indigo #1D4ED8, Store B crimson #DC2626) without per-component props.
export default async function StorefrontLayout({
  children,
  params,
}: StorefrontLayoutProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  // Override the brand vars the design tokens read from. Everything downstream
  // (buttons, links, focus, hero panel) inherits these.
  const themeStyle = {
    "--color-primary": ctx.theme.primary,
    "--color-accent": ctx.theme.accent,
  } as React.CSSProperties;

  return (
    <div style={themeStyle} className="flex min-h-screen flex-col bg-bg">
      <StoreHeader store={ctx.store} />
      <main className="flex-1">{children}</main>
      <StoreFooter store={ctx.store} />
    </div>
  );
}
