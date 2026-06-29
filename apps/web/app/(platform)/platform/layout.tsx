import "./platform.css";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { asPlatformAdmin } from "@hybrid/db";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { getDict } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { PlatformSidebar } from "./PlatformSidebar";

// Auth-gated super-admin shell (blueprint S-PLATFORM). app.{root} -> /platform.
// Middleware rewrites the host but does NOT gate by role, so this layout enforces
// authz: only app_user.is_platform_admin reaches any /platform page. force-dynamic
// so the cookie-based gate is evaluated per request, never prerendered. The
// "Homies-Lab" console skin lives in platform.css, scoped under .platform-shell.
export const dynamic = "force-dynamic";

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
  if (!admin) redirect("/dev-login?as=admin");

  const { locale } = await getDict();
  const name = await resolveAdminName(admin.userId);

  return (
    <LocaleProvider locale={locale}>
      <div className="platform-shell flex min-h-screen">
        <PlatformSidebar adminName={name} />
        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden px-6 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </LocaleProvider>
  );
}
