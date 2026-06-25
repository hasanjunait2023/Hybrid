import { listPlatformMembers } from "@/lib/platform/team";
import { TeamManager } from "./TeamManager";

// Platform team (PP1-B1). Hybrid's own staff + roles. Authz via layout; team
// management itself is super-admin-gated in the actions.
export const dynamic = "force-dynamic";

export default async function PlatformTeamPage() {
  const members = await listPlatformMembers();

  return (
    <div lang="en" className="space-y-4">
      <div>
        <a href="/platform" className="text-sm font-medium text-ink-muted hover:text-primary">← ড্যাশবোর্ড</a>
        <h1 className="mt-1 text-xl font-bold text-ink">টিম ও ভূমিকা</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Hybrid-এর অভ্যন্তরীণ স্টাফ। ভূমিকা: super-admin (সব) · accountant (বিলিং/হিসাব) · support · sales · ops।
        </p>
      </div>
      <TeamManager members={members} />
    </div>
  );
}
