// Loyalty points engine — earn on delivered orders + redeem on checkout.
//
// All ledger entries go through this module so the balance (sum of signed
// points) can never silently drift. Read-only balance queries read the ledger
// directly via SUM(points) for performance.

import { withTenant, asPlatformAdmin } from "@hybrid/db";

export interface LoyaltyProgram {
  enabled: boolean;
  earnPer100: number;          // points earned per 100 BDT spent
  takaPerPoint: number;       // redemption value (BDT) per 1 point
}

export interface LedgerEntry {
  id: string;
  points: number;             // signed: +earn, -redeem
  reason: "earn" | "redeem" | "adjust";
  orderId: string | null;
  createdAt: string;
}

export interface LoyaltyBalance {
  customerId: string;
  points: number;             // current balance (sum of ledger)
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  /** Approximate BDT value at current redemption rate. */
  approximateValue: number;
}

/** Read the tenant's loyalty program configuration (default if none). */
export async function getLoyaltyProgram(tenantId: string): Promise<LoyaltyProgram> {
  return asPlatformAdmin(async (tx) => {
    const rows = await tx<{
      enabled: boolean;
      earn_per_100: number;
      taka_per_point: string;
    }[]>`
      select enabled, earn_per_100, taka_per_point
      from loyalty_program where tenant_id = ${tenantId} limit 1
    `;
    if (rows.length === 0) {
      return { enabled: false, earnPer100: 1, takaPerPoint: 1 };
    }
    const r = rows[0];
    if (!r) {
      return { enabled: false, earnPer100: 1, takaPerPoint: 1 };
    }
    return {
      enabled: r.enabled,
      earnPer100: r.earn_per_100,
      takaPerPoint: Number(r.taka_per_point),
    };
  });
}

/** Earn points on order delivery. Idempotent via partial unique index on
 *  loyalty_ledger(order_id) WHERE reason='earn'. */
export async function earnPointsOnDelivery(
  tenantId: string,
  userId: string,
  orderId: string,
  grandTotal: number,
): Promise<{ points: number; awarded: boolean }> {
  const program = await getLoyaltyProgram(tenantId);
  if (!program.enabled) return { points: 0, awarded: false };

  const points = Math.floor((grandTotal / 100) * program.earnPer100);
  if (points <= 0) return { points: 0, awarded: false };

  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into loyalty_ledger (tenant_id, customer_id, order_id, points, reason)
      select ${tenantId}, o.customer_id, ${orderId}, ${points}, 'earn'
      from orders o where o.id = ${orderId} and o.customer_id is not null
      returning id
    `;
    return {
      points,
      awarded: rows.length > 0,
    };
  });
}

/** Redeem points at checkout — atomic decrement + ledger entry. */
export async function redeemPoints(
  tenantId: string,
  userId: string,
  customerId: string,
  pointsToRedeem: number,
  orderId: string,
): Promise<{ ok: boolean; discountTaka: number; error?: string }> {
  if (pointsToRedeem <= 0) {
    return { ok: false, discountTaka: 0, error: "invalid_points" };
  }
  const program = await getLoyaltyProgram(tenantId);
  if (!program.enabled) {
    return { ok: false, discountTaka: 0, error: "loyalty_disabled" };
  }

  return withTenant(tenantId, userId, async (tx) => {
    const balanceRows = await tx<{ balance: number }[]>`
      select coalesce(sum(points), 0)::int as balance
      from loyalty_ledger
      where tenant_id = ${tenantId} and customer_id = ${customerId}
      for update
    `;
    const balance = balanceRows[0]?.balance ?? 0;
    if (balance < pointsToRedeem) {
      return { ok: false, discountTaka: 0, error: "insufficient_balance" };
    }
    await tx`
      insert into loyalty_ledger (tenant_id, customer_id, order_id, points, reason)
      values (${tenantId}, ${customerId}, ${orderId}, ${-pointsToRedeem}, 'redeem')
    `;
    return {
      ok: true,
      discountTaka: pointsToRedeem * program.takaPerPoint,
    };
  });
}

/** Read current balance + lifetime stats for a customer. */
export async function getLoyaltyBalance(
  tenantId: string,
  customerId: string,
): Promise<LoyaltyBalance> {
  const program = await getLoyaltyProgram(tenantId);
  return withTenant(tenantId, customerId, async (tx) => {
    const rows = await tx<{
      balance: number;
      lifetime_earned: number;
      lifetime_redeemed: number;
    }[]>`
      select
        coalesce(sum(points), 0)::int as balance,
        coalesce(sum(case when points > 0 then points else 0 end), 0)::int as lifetime_earned,
        coalesce(sum(case when points < 0 then -points else 0 end), 0)::int as lifetime_redeemed
      from loyalty_ledger
      where tenant_id = ${tenantId} and customer_id = ${customerId}
    `;
    const r = rows[0];
    return {
      customerId,
      points: r?.balance ?? 0,
      lifetimeEarned: r?.lifetime_earned ?? 0,
      lifetimeRedeemed: r?.lifetime_redeemed ?? 0,
      approximateValue: (r?.balance ?? 0) * program.takaPerPoint,
    };
  });
}

/** Read recent ledger entries (for UI display). */
export async function listLedgerEntries(
  tenantId: string,
  customerId: string,
  limit = 20,
): Promise<LedgerEntry[]> {
  return withTenant(tenantId, customerId, async (tx) => {
    const rows = await tx<{
      id: string;
      points: number;
      reason: string;
      order_id: string | null;
      created_at: string;
    }[]>`
      select id, points, reason, order_id, created_at
      from loyalty_ledger
      where tenant_id = ${tenantId} and customer_id = ${customerId}
      order by created_at desc
      limit ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      points: r.points,
      reason: r.reason as LedgerEntry["reason"],
      orderId: r.order_id,
      createdAt: r.created_at,
    }));
  });
}