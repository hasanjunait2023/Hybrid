import "./platform.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { asPlatformAdmin } from "@hybrid/db";
import { HybridLogo } from "@hybrid/ui";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { loginPath } from "@/lib/auth/urls";
import { getDict } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { PlatformSidebar } from "./PlatformSidebar";
import { PlatformBottomNav } from "./PlatformBottomNav";
import { PwaRegister } from "./PwaRegister";

// Auth-gated super-admin shell (blueprint S-PLATFORM). app.{root} -> /platform.
// Middleware rewrites the host but does NOT gate by role, so this layout enforces
// authz: only app_user.is_platform_admin reaches any /platform page. force-dynamic
// so the cookie-based gate is evaluated per request, never prerendered. The
// "Homies-Lab" console skin lives in platform.css, scoped under .platform-shell.
// Mobile: the sidebar collapses (hidden < lg); a sticky top bar + bottom tab nav
// take over, and the SW registers so the console installs as a PWA.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hybrid Admin",
  appleWebApp: { capable: true, title: "Hybrid Admin", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f5c518",
  width: "device-width",
  initialScale: 1,
};

async function resolveAdminName(userId: string): Promise<string> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ full_name: string | null; email: string | null }[]>`
      select full_name, email from app_user where id = ${userId} limit 1
    `,
  );
  const r = rows[0];
  return r?.full_name?.trim() || r?.email?.split("@")[0] || "Admin";
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect(loginPath("admin"));

  const { locale } = await getDict();
  const name = await resolveAdminName(admin.userId);

  return (
    <LocaleProvider locale={locale}>
      <PwaRegister />
      <div className="platform-shell flex min-h-screen">
        <PlatformSidebar adminName={name} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar (sidebar is hidden < lg) */}
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--pf-border)] bg-[var(--pf-panel)] px-4 py-3 lg:hidden">
            <HybridLogo size="sm" />
            <span className="rounded-full bg-[var(--pf-yellow-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pf-yellow-deep)]">Admin</span>
            <span className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pf-yellow)] text-[13px] font-bold text-[var(--pf-black)]">
              {name.slice(0, 1).toUpperCase()}
            </span>
          </header>
          <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden px-4 py-4 pb-24 sm:px-5 lg:px-8 lg:py-6 lg:pb-8">
            {children}
          </main>
        </div>
        <PlatformBottomNav />
      </div>
    </LocaleProvider>
  );
}
