import { listPlatformMembers } from "@/lib/platform/team";
import { getDict } from "@/lib/i18n/server";
import { TeamManager } from "./TeamManager";

// Platform team (PP1-B1). Hybrid's own staff + roles. Authz via layout; team
// management itself is super-admin-gated in the actions.
export const dynamic = "force-dynamic";

export default async function PlatformTeamPage() {
  const members = await listPlatformMembers();
  const { d } = await getDict();
  const tx = d.platform.team;

  return (
    <div className="space-y-4">
      <div>
        <a href="/platform" className="text-sm font-medium text-ink-muted hover:text-primary">{d.platform.common.backToDashboard}</a>
        <h1 className="mt-1 text-xl font-bold text-ink">{tx.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {tx.intro}
        </p>
      </div>
      <TeamManager members={members} />
    </div>
  );
}
