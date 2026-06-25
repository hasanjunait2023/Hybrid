import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listMembers, getMemberRole } from "@/lib/admin/staff";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
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

  const { locale, d } = await getDict();
  const t = d.admin.settingsComms;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.staff.title}
        subtitle={`${formatNumber(members.length, locale)} ${t.staff.membersUnit}`}
      />
      <p className="text-sm text-ink-muted">{t.staff.description}</p>
      <StaffManager
        members={members}
        canManage={canManage}
        isOwner={isOwner}
        selfUserId={session.userId}
      />
    </div>
  );
}
