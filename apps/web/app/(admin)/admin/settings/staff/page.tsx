import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listMembers, getMemberRole } from "@/lib/admin/staff";
import { PageHeader } from "../../_ui";
import { StaffManager } from "./StaffManager";

// Staff & roles (tenant roadmap P2-2). Owner/admin manage members + roles; staff
// see the roster read-only. Login provisioning is separate (INFRA §B).
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [members, callerRole] = await Promise.all([
    listMembers(tenantId),
    getMemberRole(tenantId, session.userId),
  ]);
  const canManage = callerRole === "owner" || callerRole === "admin";
  const isOwner = callerRole === "owner";

  return (
    <div lang="en" className="space-y-4">
      <PageHeader title="স্টাফ ও ভূমিকা" subtitle={`${members.length} জন সদস্য`} />
      <p className="text-sm text-ink-muted">
        মালিক ও অ্যাডমিন সদস্য যোগ/সরাতে পারেন। ভূমিকা: মালিক (সব), অ্যাডমিন (পরিচালনা), স্টাফ (দৈনিক কাজ)।
      </p>
      <StaffManager
        members={members}
        canManage={canManage}
        isOwner={isOwner}
        selfUserId={session.userId}
      />
    </div>
  );
}
