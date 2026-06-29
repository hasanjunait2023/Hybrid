// CRM lead / pre-customer pipeline data layer (admin, Phase R1.3). A lead is a
// prospect who hasn't ordered yet — a Facebook/WhatsApp inquiry, an abandoned
// cart, a walk-in — moving through new → contacted → qualified → won/lost. On
// convert it upserts (and links) the customer it became. All via withTenant (RLS).
import { withTenant } from "@hybrid/db";
import { upsertCustomerByPhone } from "@/lib/commerce/customer";

export type LeadStage = "new" | "contacted" | "qualified" | "won" | "lost";
export type LeadSource = "manual" | "abandoned_cart" | "inquiry" | "facebook" | "whatsapp";

/** Pipeline order — the stages a lead advances through, excluding the lost sink. */
export const LEAD_STAGES: LeadStage[] = ["new", "contacted", "qualified", "won"];

export interface LeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  source: string;
  stage: LeadStage;
  estValue: number;
  note: string | null;
  customerId: string | null;
  lastActivityAt: string;
  createdAt: string;
}

interface LeadDbRow {
  id: string;
  name: string | null;
  phone: string | null;
  source: string;
  stage: string;
  est_value: string;
  note: string | null;
  customer_id: string | null;
  last_activity_at: string;
  created_at: string;
}

function toRow(r: LeadDbRow): LeadRow {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    source: r.source,
    stage: r.stage as LeadStage,
    estValue: Number(r.est_value),
    note: r.note,
    customerId: r.customer_id,
    lastActivityAt: r.last_activity_at,
    createdAt: r.created_at,
  };
}

export type LeadStageFilter = LeadStage | "all";

export async function listLeads(
  tenantId: string,
  userId: string,
  stage: LeadStageFilter = "all",
): Promise<LeadRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<LeadDbRow[]>`
      select id, name, phone, source, stage, est_value, note, customer_id,
             last_activity_at, created_at
        from crm_lead
       where (${stage} = 'all' or stage = ${stage})
       order by last_activity_at desc
       limit 300
    `,
  );
  return rows.map(toRow);
}

export interface PipelineStageSummary {
  stage: LeadStage;
  count: number;
  value: number;
}

export interface PipelineSummary {
  stages: PipelineStageSummary[];
  /** open = not won and not lost — the live pipeline. */
  openCount: number;
  openValue: number;
}

// Pipeline health: count + estimated value per stage, plus the open total (the
// money still in play). Drives the board headers and a dashboard signal later.
export async function getPipelineSummary(
  tenantId: string,
  userId: string,
): Promise<PipelineSummary> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ stage: string; count: number; value: string }[]>`
      select stage, count(*)::int as count, coalesce(sum(est_value), 0) as value
        from crm_lead
       group by stage
    `,
  );
  const byStage = new Map(rows.map((r) => [r.stage, { count: r.count, value: Number(r.value) }]));
  const allStages: LeadStage[] = ["new", "contacted", "qualified", "won", "lost"];
  const stages = allStages.map((stage) => ({
    stage,
    count: byStage.get(stage)?.count ?? 0,
    value: byStage.get(stage)?.value ?? 0,
  }));
  const open = stages.filter((s) => s.stage !== "won" && s.stage !== "lost");
  return {
    stages,
    openCount: open.reduce((n, s) => n + s.count, 0),
    openValue: open.reduce((n, s) => n + s.value, 0),
  };
}

export interface CreateLeadInput {
  name?: string | null;
  phone?: string | null;
  source?: LeadSource;
  estValue?: number;
  note?: string | null;
}

export async function createLead(
  tenantId: string,
  userId: string,
  input: CreateLeadInput,
): Promise<{ id: string }> {
  const name = input.name?.trim() || null;
  const phone = input.phone?.trim() || null;
  const source: LeadSource = input.source ?? "manual";
  const estValue = Math.max(0, input.estValue ?? 0);
  const note = input.note?.trim() || null;

  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      insert into crm_lead (tenant_id, name, phone, source, est_value, note, created_by)
      values (${tenantId}, ${name}, ${phone}, ${source}, ${estValue}, ${note}, ${userId})
      returning id
    `,
  );
  return { id: rows[0]!.id };
}

export async function setLeadStage(
  tenantId: string,
  userId: string,
  id: string,
  stage: LeadStage,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      update crm_lead
         set stage = ${stage}, last_activity_at = now()
       where id = ${id} and tenant_id = ${tenantId}
    `;
  });
}

export async function deleteLead(
  tenantId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`delete from crm_lead where id = ${id} and tenant_id = ${tenantId}`;
  });
}

export interface ConvertLeadResult {
  ok: boolean;
  customerId?: string;
  reason?: "no_phone" | "not_found";
}

// Convert a lead into a customer: upsert by phone (the natural BD key), mark the
// lead 'won' and link the customer it became. Requires a phone — without one
// there's no customer to create. One withTenant txn so the upsert + link commit
// atomically.
export async function convertLead(
  tenantId: string,
  userId: string,
  id: string,
): Promise<ConvertLeadResult> {
  return withTenant(tenantId, userId, async (tx) => {
    const leads = await tx<{ name: string | null; phone: string | null }[]>`
      select name, phone from crm_lead where id = ${id} and tenant_id = ${tenantId} limit 1
    `;
    const lead = leads[0];
    if (!lead) return { ok: false, reason: "not_found" as const };
    if (!lead.phone) return { ok: false, reason: "no_phone" as const };

    const customerId = await upsertCustomerByPhone(tx, tenantId, {
      phone: lead.phone,
      name: lead.name ?? lead.phone,
    });
    await tx`
      update crm_lead
         set stage = 'won', customer_id = ${customerId}, last_activity_at = now()
       where id = ${id} and tenant_id = ${tenantId}
    `;
    return { ok: true, customerId };
  });
}
