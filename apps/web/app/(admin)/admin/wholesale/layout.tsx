import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getTenantBusinessType } from "@/lib/admin/wholesale";

// Wholesale admin boundary guard. The wholesale dashboard section is for
// wholesale/both tenants only — a retail tenant has no B2B data and must never
// reach these pages, even by typing the URL directly (the AdminNav already hides
// the links; this is the server-side enforcement so the split holds everywhere).
export const dynamic = "force-dynamic";

export default async function WholesaleAdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const businessType = await getTenantBusinessType(tenantId);
  if (businessType === "retail") notFound();

  return <>{children}</>;
}
