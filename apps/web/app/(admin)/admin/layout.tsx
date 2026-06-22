import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

// Tenant admin shell (blueprint §7). getSession → resolve tenant from
// membership; redirect to /dev-login when there is no session. Admin is the
// "calm, capable" dialect (DESIGN §2): comfortable density, indigo for primary
// actions only, marigold nearly absent. Latin numerals / tabular-nums (§4.4).
//
// /admin is owner/staff-only (tenant-scoped). The dev identities map as:
//   ?as=owner-a / ?as=owner-b  -> tenant admin (have a tenant_member row)
//   ?as=admin                  -> platform super-admin (no membership) -> /platform
// A session user with no tenant membership is sent to /platform, NOT back to
// /dev-login: looping there would re-issue the same membership-less cookie and
// spin forever (the ?as=admin redirect-loop bug).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");

  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  return (
    <div className="min-h-screen bg-bg" lang="en">
      <header className="sticky top-0 z-sticky border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-admin items-center gap-4 px-4">
          <span className="text-base font-bold text-ink">Hybrid Admin</span>
          <nav aria-label="Admin" className="flex items-center gap-1 text-sm">
            <a
              href="/admin/products"
              className="rounded-md px-3 py-1.5 font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              পণ্য
            </a>
          </nav>
          <span className="ml-auto font-mono text-xs text-ink-subtle">
            {tenantId.slice(0, 8)}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-admin px-4 py-6">{children}</main>
    </div>
  );
}
