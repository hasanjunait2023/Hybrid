import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listBlocklist } from "@/lib/admin/fraud";
import { PageHeader } from "../../_ui";
import { BlocklistManager } from "./BlocklistManager";

// Phone blocklist (tenant roadmap P1 #2). Sellers maintain a list of blocked
// numbers (repeat non-responders / fake COD orders). Blocked numbers surface as
// a risk signal on the order-detail panel. Admin = Latin numerals.
export const dynamic = "force-dynamic";

export default async function BlacklistPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const rows = await listBlocklist(tenantId, session.userId);

  return (
    <div lang="en" className="space-y-4">
      <PageHeader
        title="ব্লকড নম্বর"
        subtitle={`${rows.length} টি নম্বর ব্লক করা আছে`}
      />
      <p className="text-sm text-ink-muted">
        ব্লক করা নম্বরের অর্ডারে সতর্কতা দেখানো হবে — COD প্রতারণা / বারবার বাতিল করা গ্রাহক ঠেকাতে।
      </p>
      <BlocklistManager rows={rows} />
    </div>
  );
}
