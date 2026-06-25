import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform/auth";
import { getDict } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";

// Auth-gated shell: must run per request so the session is evaluated at runtime
// (never statically prerendered into a baked redirect). getPlatformAdmin reads
// cookies; force-dynamic guarantees the gate is not cached.
export const dynamic = "force-dynamic";

// Super-admin shell (blueprint S-PLATFORM). app.{root} -> /platform. The
// middleware rewrites the host but does NOT gate by role, so the layout enforces
// authz: only app_user.is_platform_admin reaches any /platform page. A logged-in
// non-admin (e.g. a store owner) is bounced to their admin; an anonymous visitor
// to dev-login. Operator-facing → utilitarian/dense, Latin numerals (DESIGN §2).
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dev-login?as=admin");

  const { locale, d } = await getDict();

  return (
    <LocaleProvider locale={locale}>
      <div className="min-h-screen bg-bg">
        <header className="sticky top-0 z-sticky border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-admin items-center gap-3 px-4">
            <span className="text-base font-bold text-ink">{d.platform.shell.title}</span>
            <span className="ml-auto flex items-center gap-3">
              <span className="font-mono text-2xs text-ink-subtle">{d.platform.shell.superAdmin}</span>
              <LanguageToggle />
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-admin px-4 py-6">{children}</main>
      </div>
    </LocaleProvider>
  );
}
