import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getTenantBusinessType } from "@/lib/admin/wholesale";
import { getTenantSlug } from "@/lib/theme/data";
import { platformHomeUrl, loginPath } from "@/lib/auth/urls";
import { HybridLogo } from "@hybrid/ui";
import { getDict } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { AdminNav } from "./AdminNav";
import { LiveOrdersBanner } from "./LiveOrdersBanner";

// Auth-gated shell: must run per request so the session is evaluated at runtime
// (never statically prerendered into a baked redirect to /dev-login). getSession
// reads cookies; force-dynamic guarantees the gate is not cached.
export const dynamic = "force-dynamic";

// Tenant admin shell (DESIGN §P2.1). The "calm, capable" dialect: comfortable
// density, indigo for the single primary action only, marigold nearly absent,
// Latin numerals / tabular-nums (§4.4). Mobile-only sellers get a bottom tab bar
// (one-thumb reality); a fixed left sidebar appears ≥ lg.
//
// /admin is owner/staff-only (tenant-scoped). A session user with no tenant
// membership (e.g. a platform super-admin who logged in via the admin host) is
// sent to the PLATFORM HOST — an absolute app.{ROOT}/ URL, NOT a relative
// "/platform" (which on the admin host rewrites to /admin/platform -> 404).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect(loginPath("owner-a"));

  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect(await platformHomeUrl());

  const [{ locale, d }, businessType, tenantSlug] = await Promise.all([
    getDict(),
    getTenantBusinessType(tenantId),
    getTenantSlug(tenantId, session.userId),
  ]);
  const showWholesale = businessType === "wholesale" || businessType === "both";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me:3000";
  const storefrontUrl = tenantSlug ? `//${tenantSlug}.${rootDomain}` : null;

  return (
    <LocaleProvider locale={locale}>
      <div className="min-h-screen bg-bg lg:flex">
        {/* Desktop sidebar (≥ lg) */}
        <AdminNav variant="sidebar" tenantId={tenantId} showWholesale={showWholesale} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar (all sizes) */}
          <header className="sticky top-0 z-sticky border-b border-border bg-surface">
            <div className="mx-auto flex h-14 max-w-admin items-center gap-3 px-4">
              <HybridLogo size="sm" className="lg:hidden" />
              <span className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
                <span className="hidden font-mono text-xs text-ink-subtle sm:inline">
                  {tenantId.slice(0, 8)}
                </span>
                <LanguageToggle />
                {storefrontUrl && (
                  <a
                    href={storefrontUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center rounded-md px-3 text-xs font-medium text-ink-muted hover:bg-surface-2"
                  >
                    {d.admin.shell.storeLink}
                  </a>
                )}
              </span>
            </div>
          </header>

          {/* Content — bottom padding clears the mobile tab bar */}
          <main className="mx-auto w-full max-w-admin flex-1 px-4 py-5 pb-24 lg:pb-8">
            {children}
          </main>
        </div>

        {/* Mobile bottom tab bar (base–md) */}
        <AdminNav variant="tabs" tenantId={tenantId} showWholesale={showWholesale} />
      </div>
      <LiveOrdersBanner />
    </LocaleProvider>
  );
}
