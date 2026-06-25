import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getProgram } from "@/lib/admin/loyalty";
import { PageHeader } from "../../_ui";
import { LoyaltyForm } from "./LoyaltyForm";

// Loyalty program settings (tenant roadmap P3-2). Enable + set earn/redeem
// rates. Earn fires on delivered orders; redemption converts points to a taka
// discount at checkout (wiring follows).
export const dynamic = "force-dynamic";

export default async function LoyaltySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const program = await getProgram(tenantId, session.userId);

  return (
    <div lang="en" className="space-y-4">
      <PageHeader title="লয়্যালটি পয়েন্ট" subtitle="রিপিট ক্রেতাদের পুরস্কার দিন" />
      <LoyaltyForm program={program} />
    </div>
  );
}
