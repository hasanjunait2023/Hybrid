import { listPlatformMembers } from "@/lib/platform/team";
import { getDict } from "@/lib/i18n/server";
import { TeamManager } from "./TeamManager";

// Platform team (PP1-B1). Hybrid's own staff + roles. "Homies-Lab" console skin.
// Authz via layout; team management itself is super-admin-gated in the actions.
export const dynamic = "force-dynamic";

export default async function PlatformTeamPage() {
  const members = await listPlatformMembers();
  const { d } = await getDict();
  const tx = d.platform.team;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Team</span>
      </p>
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">{tx.title}</h1>
        <p className="mt-1 text-[13px] text-[var(--pf-muted)]">{tx.intro}</p>
      </div>
      <TeamManager members={members} />
    </div>
  );
}
