// Wholesale marketplace MONTHLY FEE (commission model chosen 2026-06-29: flat
// monthly fee per wholesaler, not per-transaction %). Platform tables (Hybrid's
// own books), is_platform_admin-guarded — all via asPlatformAdmin. Money as
// numbers. period is the first-of-month date 'YYYY-MM-01' (Dhaka).
import { asPlatformAdmin } from "@hybrid/db";

export type FeeStatus = "pending" | "paid" | "waived";

// Normalize 'YYYY-MM' or any 'YYYY-MM-DD' to the first-of-month 'YYYY-MM-01'.
export function monthStart(input: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(input.trim());
  if (!m) throw new Error("INVALID_PERIOD");
  return `${m[1]}-${m[2]}-01`;
}

// Current Dhaka month as 'YYYY-MM-01'.
export function currentPeriod(): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
  return monthStart(ymd);
}

export interface WholesalerFeeRow {
  tenantId: string;
  name: string;
  slug: string;
  businessType: string;
  monthlyFee: number; // configured fee on the tenant
  feeId: string | null; // the billed line for the period, if generated
  billedAmount: number | null;
  status: FeeStatus | null;
}

// Every wholesale/both tenant + its configured fee + the billed line for `period`.
export async function listWholesalerFees(period: string): Promise<WholesalerFeeRow[]> {
  const p = monthStart(period);
  const rows = await asPlatformAdmin((tx) =>
    tx<
      {
        tenant_id: string;
        name: string;
        slug: string;
        business_type: string;
        monthly_fee: string;
        fee_id: string | null;
        billed_amount: string | null;
        status: string | null;
      }[]
    >`
      select t.id as tenant_id, t.name, t.slug, t.business_type,
             t.marketplace_monthly_fee as monthly_fee,
             f.id as fee_id, f.amount as billed_amount, f.status
        from tenant t
        left join marketplace_fee f
          on f.tenant_id = t.id and f.period_month = ${p}::date
       where t.business_type in ('wholesale'::tenant_business_type, 'both'::tenant_business_type)
       order by t.name asc
    `,
  );
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    name: r.name,
    slug: r.slug,
    businessType: r.business_type,
    monthlyFee: Number(r.monthly_fee),
    feeId: r.fee_id,
    billedAmount: r.billed_amount == null ? null : Number(r.billed_amount),
    status: (r.status as FeeStatus | null) ?? null,
  }));
}

// Set a wholesaler's configured monthly fee (0 disables it).
export async function setMonthlyFee(tenantId: string, amount: number): Promise<void> {
  if (!(amount >= 0)) throw new Error("AMOUNT_INVALID");
  await asPlatformAdmin(async (tx) => {
    await tx`
      update tenant set marketplace_monthly_fee = ${amount}, updated_at = now()
       where id = ${tenantId}
    `;
  });
}

// Generate (idempotent) the billed lines for `period`: one pending row per
// wholesale/both tenant with a fee > 0. Existing rows (incl. paid/waived) are
// left untouched — re-running never double-bills. Returns the count created.
export async function generateMonthlyFees(period: string): Promise<number> {
  const p = monthStart(period);
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`
      insert into marketplace_fee (tenant_id, period_month, amount, status)
      select t.id, ${p}::date, t.marketplace_monthly_fee, 'pending'
        from tenant t
       where t.business_type in ('wholesale'::tenant_business_type, 'both'::tenant_business_type)
         and t.marketplace_monthly_fee > 0
      on conflict (tenant_id, period_month) do nothing
      returning id
    `,
  );
  return rows.length;
}

// Move a billed line to paid / waived / pending. paid stamps paid_at; any other
// status clears it.
export async function setFeeStatus(feeId: string, status: FeeStatus): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    if (status === "paid") {
      await tx`update marketplace_fee set status = 'paid', paid_at = now() where id = ${feeId}`;
    } else {
      await tx`update marketplace_fee set status = ${status}, paid_at = null where id = ${feeId}`;
    }
  });
}

export interface FeeSummary {
  billed: number; // sum of all generated lines for the period
  collected: number; // sum of paid lines
  pending: number; // sum of pending lines
  waived: number; // sum of waived lines
  wholesalerCount: number;
}

export async function getFeeSummary(period: string): Promise<FeeSummary> {
  const p = monthStart(period);
  return asPlatformAdmin(async (tx) => {
    const agg = await tx<{ billed: string; collected: string; pending: string; waived: string }[]>`
      select
        coalesce(sum(amount), 0) as billed,
        coalesce(sum(amount) filter (where status = 'paid'), 0) as collected,
        coalesce(sum(amount) filter (where status = 'pending'), 0) as pending,
        coalesce(sum(amount) filter (where status = 'waived'), 0) as waived
      from marketplace_fee where period_month = ${p}::date
    `;
    const wc = await tx<{ n: string }[]>`
      select count(*)::bigint as n from tenant
       where business_type in ('wholesale'::tenant_business_type, 'both'::tenant_business_type)
    `;
    return {
      billed: Number(agg[0]?.billed ?? 0),
      collected: Number(agg[0]?.collected ?? 0),
      pending: Number(agg[0]?.pending ?? 0),
      waived: Number(agg[0]?.waived ?? 0),
      wholesalerCount: Number(wc[0]?.n ?? 0),
    };
  });
}
