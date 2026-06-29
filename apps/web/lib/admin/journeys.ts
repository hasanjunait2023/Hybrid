// CRM lifecycle automation — journey CRUD (admin, Phase R1.4). A journey is a
// segment/event-triggered message (review request, win-back, repeat-buyer
// thank-you). The evaluation + send lives in lib/crm/runJourneys; this module is
// the management surface. All via withTenant (RLS).
import { withTenant } from "@hybrid/db";

export type JourneyTrigger = "review_request" | "win_back" | "repeat_buyer";
export type JourneyChannel = "sms"; // whatsapp deferred (needs approved templates)

export const JOURNEY_TRIGGERS: JourneyTrigger[] = [
  "review_request",
  "win_back",
  "repeat_buyer",
];

export interface JourneyRow {
  id: string;
  name: string;
  trigger: JourneyTrigger;
  channel: string;
  message: string;
  thresholdDays: number;
  minOrders: number;
  isActive: boolean;
  runCount: number;
  createdAt: string;
}

interface JourneyDbRow {
  id: string;
  name: string;
  trigger: string;
  channel: string;
  message: string;
  threshold_days: number;
  min_orders: number;
  is_active: boolean;
  run_count: number;
  created_at: string;
}

function toRow(r: JourneyDbRow): JourneyRow {
  return {
    id: r.id,
    name: r.name,
    trigger: r.trigger as JourneyTrigger,
    channel: r.channel,
    message: r.message,
    thresholdDays: r.threshold_days,
    minOrders: r.min_orders,
    isActive: r.is_active,
    runCount: r.run_count,
    createdAt: r.created_at,
  };
}

export async function listJourneys(
  tenantId: string,
  userId: string,
): Promise<JourneyRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<JourneyDbRow[]>`
      select j.id, j.name, j.trigger, j.channel, j.message, j.threshold_days,
             j.min_orders, j.is_active, j.created_at,
             (select count(*) from crm_journey_run r where r.journey_id = j.id)::int as run_count
        from crm_journey j
       order by j.created_at desc
    `,
  );
  return rows.map(toRow);
}

export interface CreateJourneyInput {
  name: string;
  trigger: JourneyTrigger;
  message: string;
  thresholdDays?: number;
  minOrders?: number;
}

export async function createJourney(
  tenantId: string,
  userId: string,
  input: CreateJourneyInput,
): Promise<{ id: string }> {
  const name = input.name.trim();
  const message = input.message.trim();
  const thresholdDays = Math.max(0, Math.trunc(input.thresholdDays ?? 0));
  const minOrders = Math.max(0, Math.trunc(input.minOrders ?? 0));

  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      insert into crm_journey (tenant_id, name, trigger, channel, message, threshold_days, min_orders, created_by)
      values (${tenantId}, ${name}, ${input.trigger}, 'sms', ${message}, ${thresholdDays}, ${minOrders}, ${userId})
      returning id
    `,
  );
  return { id: rows[0]!.id };
}

export async function toggleJourney(
  tenantId: string,
  userId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`update crm_journey set is_active = ${isActive} where id = ${id} and tenant_id = ${tenantId}`;
  });
}

export async function deleteJourney(
  tenantId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`delete from crm_journey where id = ${id} and tenant_id = ${tenantId}`;
  });
}
