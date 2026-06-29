import "server-only";

// CRM lifecycle automation runner (Phase R1.4). Evaluates each active journey's
// trigger against a tenant's customers/orders and sends the message via the SMS
// adapter (the existing gated send — log-only until SMS_LIVE=1). Every send is
// guarded by a crm_journey_run row keyed (journey, customer, reference) with
// ON CONFLICT DO NOTHING, so a recipient is never messaged twice for the same
// event — safe to run on any schedule.
//
// Two entry points share one core (claimDue): runJourneysForTenant (admin
// "Run now", withTenant) and runAllJourneys (CRON across tenants,
// asPlatformAdmin). The core filters by tenant_id explicitly so it is correct
// under either RLS context.
import type { Tx } from "@hybrid/db";
import { withTenant, asPlatformAdmin } from "@hybrid/db";
import { getSmsAdapter } from "@/lib/sms";

const PER_JOURNEY_CAP = 200;

interface Claim {
  runId: string;
  journeyId: string;
  phone: string;
  message: string;
}

export interface JourneyRunReport {
  journeyId: string;
  name: string;
  trigger: string;
  sent: number;
  failed: number;
}

export interface RunJourneysResult {
  journeys: number;
  sent: number;
  failed: number;
  reports: JourneyRunReport[];
}

interface JourneyDef {
  id: string;
  name: string;
  trigger: string;
  message: string;
  threshold_days: number;
  min_orders: number;
}

interface Candidate {
  customer_id: string;
  name: string | null;
  phone: string;
  reference_id: string | null;
}

function render(template: string, name: string | null): string {
  return template.replace(/\{name\}/g, name?.trim() || "গ্রাহক");
}

// Find this journey's due recipients (trigger-specific), then claim each by
// inserting a run row (idempotent). Returns only the freshly-claimed sends.
async function claimDue(tx: Tx, tenantId: string, j: JourneyDef): Promise<Claim[]> {
  let candidates: Candidate[] = [];

  if (j.trigger === "review_request") {
    candidates = await tx<Candidate[]>`
      select o.customer_id, c.name, c.phone, o.id as reference_id
        from orders o
        join customer c on c.id = o.customer_id
       where o.tenant_id = ${tenantId}
         and o.fulfillment_status = 'delivered'
         and c.phone is not null
         and o.updated_at <= now() - make_interval(days => ${j.threshold_days})
         and not exists (
           select 1 from crm_journey_run r
            where r.journey_id = ${j.id} and r.customer_id = o.customer_id and r.reference_id = o.id
         )
       limit ${PER_JOURNEY_CAP}
    `;
  } else if (j.trigger === "win_back") {
    candidates = await tx<Candidate[]>`
      select c.id as customer_id, c.name, c.phone, null::uuid as reference_id
        from customer c
       where c.tenant_id = ${tenantId}
         and c.phone is not null
         and c.orders_count >= 1
         and (select max(o.placed_at) from orders o where o.customer_id = c.id)
             <= now() - make_interval(days => ${j.threshold_days})
         and not exists (
           select 1 from crm_journey_run r
            where r.journey_id = ${j.id} and r.customer_id = c.id and r.reference_id is null
         )
       limit ${PER_JOURNEY_CAP}
    `;
  } else if (j.trigger === "repeat_buyer") {
    candidates = await tx<Candidate[]>`
      select c.id as customer_id, c.name, c.phone, null::uuid as reference_id
        from customer c
       where c.tenant_id = ${tenantId}
         and c.phone is not null
         and c.orders_count >= ${Math.max(1, j.min_orders)}
         and not exists (
           select 1 from crm_journey_run r
            where r.journey_id = ${j.id} and r.customer_id = c.id and r.reference_id is null
         )
       limit ${PER_JOURNEY_CAP}
    `;
  }

  const claims: Claim[] = [];
  for (const cand of candidates) {
    const inserted = await tx<{ id: string }[]>`
      insert into crm_journey_run (tenant_id, journey_id, customer_id, reference_id, status)
      values (${tenantId}, ${j.id}, ${cand.customer_id}, ${cand.reference_id}, 'sent')
      on conflict do nothing
      returning id
    `;
    const runId = inserted[0]?.id;
    if (runId) {
      claims.push({ runId, journeyId: j.id, phone: cand.phone, message: render(j.message, cand.name) });
    }
  }
  return claims;
}

// Run all of a tenant's active journeys: claim due recipients (one DB context),
// then send outside the transaction (network) and flag any failures.
async function runForTenant(
  tenantId: string,
  read: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
): Promise<RunJourneysResult> {
  const journeys = await read((tx) =>
    tx<JourneyDef[]>`
      select id, name, trigger, message, threshold_days, min_orders
        from crm_journey where tenant_id = ${tenantId} and is_active = true
    `,
  );
  if (journeys.length === 0) return { journeys: 0, sent: 0, failed: 0, reports: [] };

  const reports: JourneyRunReport[] = [];
  let totalSent = 0;
  let totalFailed = 0;
  const sms = getSmsAdapter();

  for (const j of journeys) {
    const claims = await read((tx) => claimDue(tx, tenantId, j));
    let sent = 0;
    let failed = 0;
    const failedIds: string[] = [];
    for (const claim of claims) {
      try {
        const res = await sms.send(claim.phone, claim.message);
        if (res.ok) sent++;
        else {
          failed++;
          failedIds.push(claim.runId);
        }
      } catch {
        failed++;
        failedIds.push(claim.runId);
      }
    }
    if (failedIds.length > 0) {
      await read((tx) => tx`update crm_journey_run set status = 'failed' where id in ${tx(failedIds)}`);
    }
    totalSent += sent;
    totalFailed += failed;
    reports.push({ journeyId: j.id, name: j.name, trigger: j.trigger, sent, failed });
  }

  return { journeys: journeys.length, sent: totalSent, failed: totalFailed, reports };
}

// Admin "Run now" — one tenant, under its RLS context.
export async function runJourneysForTenant(
  tenantId: string,
  userId: string,
): Promise<RunJourneysResult> {
  return runForTenant(tenantId, (fn) => withTenant(tenantId, userId, fn));
}

// CRON — every live tenant, under the platform-admin context.
export async function runAllJourneys(): Promise<RunJourneysResult> {
  const tenants = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`select id from tenant where status in ('active', 'trial', 'past_due')`,
  );
  const agg: RunJourneysResult = { journeys: 0, sent: 0, failed: 0, reports: [] };
  for (const t of tenants) {
    const r = await runForTenant(t.id, (fn) => asPlatformAdmin(fn));
    agg.journeys += r.journeys;
    agg.sent += r.sent;
    agg.failed += r.failed;
    agg.reports.push(...r.reports);
  }
  return agg;
}
