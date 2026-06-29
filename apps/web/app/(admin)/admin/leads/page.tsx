import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  listLeads,
  getPipelineSummary,
  LEAD_STAGES,
  type LeadStage,
  type LeadStageFilter,
} from "@/lib/admin/leads";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { CreateLeadForm, LeadRowActions } from "./LeadControls";

// CRM lead pipeline (Phase R1.3). Prospects who haven't ordered yet, moving
// through new → contacted → qualified → won/lost, with convert-to-customer.
export const dynamic = "force-dynamic";

const FILTERS: LeadStageFilter[] = ["all", "new", "contacted", "qualified", "won", "lost"];

// The stage "Advance" moves a lead to — the next step in the pipeline order.
function nextStageOf(stage: LeadStage): LeadStage | null {
  const i = LEAD_STAGES.indexOf(stage);
  if (i === -1 || i >= LEAD_STAGES.length - 1) return null;
  return LEAD_STAGES[i + 1] ?? null;
}

export default async function LeadsPage(props: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await props.searchParams;
  const filter: LeadStageFilter = FILTERS.includes(sp.stage as LeadStageFilter)
    ? (sp.stage as LeadStageFilter)
    : "all";

  const [leads, summary] = await Promise.all([
    listLeads(tenantId, session.userId, filter),
    getPipelineSummary(tenantId, session.userId),
  ]);
  const { locale, d } = await getDict();
  const t = d.admin.leads;

  const stageCls: Record<LeadStage, string> = {
    new: "bg-info-weak text-info",
    contacted: "bg-primary-weak text-primary",
    qualified: "bg-warning-weak text-warning",
    won: "bg-success-weak text-success",
    lost: "bg-surface-2 text-ink-muted",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <p className="text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      {/* Pipeline health */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3.5">
          <p className="text-[22px] font-bold leading-none text-ink tnum">{formatNumber(summary.openCount, locale)}</p>
          <p className="mt-1 text-2xs text-ink-muted">{t.openLeads}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3.5">
          <p className="font-mono text-[22px] font-bold leading-none text-ink tnum">{formatMoney(summary.openValue, locale)}</p>
          <p className="mt-1 text-2xs text-ink-muted">{t.pipelineValue}</p>
        </div>
        {summary.stages
          .filter((s) => s.stage === "won" || s.stage === "lost")
          .map((s) => (
            <div key={s.stage} className="rounded-lg border border-border bg-surface p-3.5">
              <p className="text-[22px] font-bold leading-none text-ink tnum">{formatNumber(s.count, locale)}</p>
              <p className="mt-1 text-2xs text-ink-muted">{t.stage[s.stage]}</p>
            </div>
          ))}
      </div>

      <CreateLeadForm t={t} />

      {/* Stage filter */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/leads?stage=${f}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f ? "bg-ink text-surface" : "bg-surface-2 text-ink-muted hover:text-ink"
            }`}
          >
            {f === "all" ? t.filterAll : t.stage[f]}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {leads.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-ink-muted">{t.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {leads.map((lead) => (
              <li key={lead.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-ink">{lead.name ?? t.noName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${stageCls[lead.stage]}`}>
                      {t.stage[lead.stage]}
                    </span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                      {t.source[lead.source as keyof typeof t.source] ?? lead.source}
                    </span>
                    {lead.estValue > 0 && (
                      <span className="font-mono text-xs font-semibold text-ink tnum">{formatMoney(lead.estValue, locale)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-2xs text-ink-subtle">
                    {lead.phone && <span className="font-mono tnum">{lead.phone}</span>}
                    {lead.note && <span className="truncate">{lead.note}</span>}
                  </div>
                </div>
                <LeadRowActions
                  id={lead.id}
                  nextStage={nextStageOf(lead.stage)}
                  closed={lead.stage === "won" || lead.stage === "lost"}
                  canConvert={!!lead.phone}
                  customerId={lead.customerId}
                  t={t}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
