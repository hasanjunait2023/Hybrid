// Loyalty points data layer (tenant roadmap P3-2). All via withTenant (RLS).
// Program rates live in loyalty_program (one row/tenant); points are a signed
// ledger (balance = sum). Earn-once-per-order is enforced by a partial unique
// index, so a double award fails at the DB rather than silently doubling.
import { withTenant } from "@hybrid/db";

export interface LoyaltyProgram {
  enabled: boolean;
  earnPer100: number;
  takaPerPoint: number;
}

const DEFAULT_PROGRAM: LoyaltyProgram = { enabled: false, earnPer100: 1, takaPerPoint: 1 };

export async function getProgram(tenantId: string, userId: string): Promise<LoyaltyProgram> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ enabled: boolean; earn_per_100: number; taka_per_point: string }[]>`
      select enabled, earn_per_100, taka_per_point from loyalty_program where tenant_id = ${tenantId}
    `,
  );
  const r = rows[0];
  if (!r) return DEFAULT_PROGRAM;
  return { enabled: r.enabled, earnPer100: r.earn_per_100, takaPerPoint: Number(r.taka_per_point) };
}

export async function updateProgram(
  tenantId: string,
  userId: string,
  input: LoyaltyProgram,
): Promise<void> {
  const earn = Math.max(0, Math.trunc(input.earnPer100));
  const taka = Math.max(0, input.takaPerPoint);
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      insert into loyalty_program (tenant_id, enabled, earn_per_100, taka_per_point, updated_at)
      values (${tenantId}, ${input.enabled}, ${earn}, ${taka}, now())
      on conflict (tenant_id) do update set
        enabled = excluded.enabled,
        earn_per_100 = excluded.earn_per_100,
        taka_per_point = excluded.taka_per_point,
        updated_at = now()
    `;
  });
}

export async function getBalance(tenantId: string, userId: string, customerId: string): Promise<number> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ balance: number }[]>`
      select coalesce(sum(points), 0)::int as balance
      from loyalty_ledger where customer_id = ${customerId}
    `,
  );
  return rows[0]?.balance ?? 0;
}

export class LoyaltyError extends Error {}

// Award earn points for a (delivered) order. Idempotent: the earn-once unique
// index means a repeat call for the same order is a no-op (returns 0). Off when
// the program is disabled.
export async function awardForOrder(
  tenantId: string,
  userId: string,
  customerId: string,
  orderId: string,
  orderTotal: number,
): Promise<number> {
  const program = await getProgram(tenantId, userId);
  if (!program.enabled) return 0;
  const points = Math.floor(orderTotal / 100) * program.earnPer100;
  if (points <= 0) return 0;
  return withTenant(tenantId, userId, async (tx) => {
    const inserted = await tx<{ id: string }[]>`
      insert into loyalty_ledger (tenant_id, customer_id, order_id, points, reason)
      values (${tenantId}, ${customerId}, ${orderId}, ${points}, 'earn')
      on conflict (tenant_id, order_id) where reason = 'earn' do nothing
      returning id
    `;
    return inserted.length > 0 ? points : 0;
  });
}

// Redeem points → taka value. Validates the live balance; never lets a customer
// go negative.
export async function redeem(
  tenantId: string,
  userId: string,
  customerId: string,
  points: number,
): Promise<{ takaValue: number; balance: number }> {
  if (!Number.isInteger(points) || points <= 0) throw new LoyaltyError("INVALID_POINTS");
  const program = await getProgram(tenantId, userId);
  return withTenant(tenantId, userId, async (tx) => {
    // Serialize concurrent redeems per customer by locking the customer row
    // (FOR UPDATE is not valid on an aggregate select, so we can't lock the sum).
    await tx`select 1 from customer where id = ${customerId} for update`;
    const bal = await tx<{ balance: number }[]>`
      select coalesce(sum(points), 0)::int as balance
      from loyalty_ledger where customer_id = ${customerId}
    `;
    const balance = bal[0]?.balance ?? 0;
    if (balance < points) throw new LoyaltyError("INSUFFICIENT");
    await tx`
      insert into loyalty_ledger (tenant_id, customer_id, points, reason)
      values (${tenantId}, ${customerId}, ${-points}, 'redeem')
    `;
    return { takaValue: points * program.takaPerPoint, balance: balance - points };
  });
}
