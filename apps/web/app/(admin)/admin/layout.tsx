import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { AdminNav } from "./AdminNav";

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
// membership (e.g. ?as=admin platform super-admin) is sent to /platform, NOT
// back to /dev-login (which would loop the membership-less cookie forever).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");

  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  return (
    <div className="min-h-screen bg-bg lg:flex" lang="en">
      {/* Desktop sidebar (≥ lg) */}
      <AdminNav variant="sidebar" tenantId={tenantId} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (all sizes) */}
        <header className="sticky top-0 z-sticky border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-admin items-center gap-3 px-4">
            <span className="text-base font-bold text-ink lg:hidden">Hybrid</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="hidden font-mono text-xs text-ink-subtle sm:inline">
                {tenantId.slice(0, 8)}
              </span>
              <a
                href={`/dev-login?as=owner-a`}
                className="rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-2"
              >
                স্টোর
              </a>
            </span>
          </div>
        </header>

        {/* Content — bottom padding clears the mobile tab bar */}
        <main className="mx-auto w-full max-w-admin flex-1 px-4 py-5 pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar (base–md) */}
      <AdminNav variant="tabs" tenantId={tenantId} />
    </div>
  );
}
