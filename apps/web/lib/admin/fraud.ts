// COD fraud / phone-risk data layer (tenant roadmap P1 #2). All tenant data via
// withTenant (RLS). Two real, fully-wired signals: a per-tenant phone blocklist
// and computed order-risk signals (prior cancels/returns + recent duplicates).
// The external phone-risk lookup (FraudBD / FraudChecker) is a credential-gated
// adapter — same pattern as bKash/Steadfast/SMS in this codebase: when the
// credential is absent it reports `configured:false` and the UI shows the
// internal signals only (never a fake score).
import { withTenant, asPlatformAdmin } from "@hybrid/db";

export interface BlocklistRow {
  id: string;
  phone: string;
  reason: string | null;
  createdAt: string;
}

export async function listBlocklist(tenantId: string, userId: string): Promise<BlocklistRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string; phone: string; reason: string | null; created_at: string }[]>`
      select id, phone, reason, created_at
      from phone_blocklist order by created_at desc limit 500
    `,
  );
  return rows.map((r) => ({ id: r.id, phone: r.phone, reason: r.reason, createdAt: r.created_at }));
}

export async function isPhoneBlocked(
  tenantId: string,
  userId: string,
  phone: string,
): Promise<boolean> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ one: number }[]>`select 1 as one from phone_blocklist where phone = ${phone} limit 1`,
  );
  return rows.length > 0;
}

/** Upsert a blocked phone (idempotent on (tenant, phone)). */
export async function blockPhone(
  tenantId: string,
  userId: string,
  phone: string,
  reason?: string,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      insert into phone_blocklist (tenant_id, phone, reason, created_by)
      values (${tenantId}, ${phone}, ${reason ?? null}, ${userId})
      on conflict (tenant_id, phone)
      do update set reason = excluded.reason
    `;
    // Feed the cross-tenant fraud network: blocking a number is a signal other
    // shops benefit from (aggregate only — see cod_risk_signal). Idempotent.
    await tx`
      insert into cod_risk_signal (tenant_id, phone, kind)
      values (${tenantId}, ${phone}, 'block')
      on conflict do nothing
    `;
  });
}

export async function unblockPhone(tenantId: string, userId: string, phone: string): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`delete from phone_blocklist where phone = ${phone}`;
  });
}

export interface OrderRiskSignals {
  phone: string | null;
  blocked: boolean;
  /** Same-phone orders in the last 24h excluding this one — duplicate-fake signal. */
  duplicateRecent: number;
  priorOrders: number;
  priorCancelled: number;
  priorReturned: number;
  priorDelivered: number;
  /** 0–1 share of this phone's prior orders that were cancelled or returned. */
  rtoRate: number;
}

// Computed entirely from the tenant's own order history + blocklist — no
// external call. Drives the order-detail risk panel and the confirm-time guard.
export async function getOrderRiskSignals(
  tenantId: string,
  userId: string,
  orderId: string,
): Promise<OrderRiskSignals> {
  return withTenant(tenantId, userId, async (tx) => {
    const head = await tx<{ phone: string | null; placed_at: string }[]>`
      select customer_phone as phone, placed_at from orders where id = ${orderId}
    `;
    const phone = head[0]?.phone ?? null;
    if (!phone) {
      return {
        phone: null, blocked: false, duplicateRecent: 0, priorOrders: 0,
        priorCancelled: 0, priorReturned: 0, priorDelivered: 0, rtoRate: 0,
      };
    }

    const blockedRows = await tx<{ one: number }[]>`
      select 1 as one from phone_blocklist where phone = ${phone} limit 1
    `;

    const agg = await tx<
      {
        prior: number;
        cancelled: number;
        returned: number;
        delivered: number;
        dup_recent: number;
      }[]
    >`
      select
        count(*) filter (where id <> ${orderId})::int as prior,
        count(*) filter (where id <> ${orderId} and fulfillment_status = 'cancelled')::int as cancelled,
        count(*) filter (where id <> ${orderId} and fulfillment_status = 'returned')::int as returned,
        count(*) filter (where id <> ${orderId} and fulfillment_status = 'delivered')::int as delivered,
        count(*) filter (
          where id <> ${orderId}
            and placed_at >= (select placed_at from orders where id = ${orderId}) - interval '24 hours'
        )::int as dup_recent
      from orders
      where customer_phone = ${phone}
    `;
    const a = agg[0];
    const prior = a?.prior ?? 0;
    const bad = (a?.cancelled ?? 0) + (a?.returned ?? 0);
    return {
      phone,
      blocked: blockedRows.length > 0,
      duplicateRecent: a?.dup_recent ?? 0,
      priorOrders: prior,
      priorCancelled: a?.cancelled ?? 0,
      priorReturned: a?.returned ?? 0,
      priorDelivered: a?.delivered ?? 0,
      rtoRate: prior > 0 ? bad / prior : 0,
    };
  });
}

// ---- Cross-tenant fraud network (Phase R2.2) -------------------------------
// The differentiator: a phone that burned one Hybrid shop warns the others —
// but only as a privacy-safe aggregate (count of shops, never which shops, never
// any order). Stores feed it on cancel / RTO / block; the read is platform-level.

export type RiskKind = "rto" | "cancel" | "block";

// Record a network signal (idempotent on tenant+phone+kind+order). Tenant-scoped
// write; called best-effort from the order status action and blockPhone.
export async function recordCodRiskSignal(
  tenantId: string,
  userId: string,
  input: { phone: string; kind: RiskKind; orderId?: string | null },
): Promise<void> {
  const phone = input.phone.trim();
  if (!phone) return;
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      insert into cod_risk_signal (tenant_id, phone, kind, order_id)
      values (${tenantId}, ${phone}, ${input.kind}, ${input.orderId ?? null})
      on conflict do nothing
    `;
  });
}

export interface NetworkPhoneRisk {
  /** distinct OTHER shops that flagged this phone. */
  storesFlagged: number;
  /** total signals from other shops. */
  signals: number;
}

// Privacy-safe cross-tenant aggregate. Runs as the platform admin and returns
// ONLY counts — never which shops, never any order. Excludes the asking tenant
// so its own history isn't double-counted with the local signals.
export async function getNetworkPhoneRisk(
  phone: string,
  excludeTenantId: string,
): Promise<NetworkPhoneRisk> {
  const p = phone.trim();
  if (!p) return { storesFlagged: 0, signals: 0 };
  const rows = await asPlatformAdmin((tx) =>
    tx<{ stores: number; signals: number }[]>`
      select count(distinct tenant_id)::int as stores, count(*)::int as signals
        from cod_risk_signal
       where phone = ${p} and tenant_id <> ${excludeTenantId}
    `,
  );
  return { storesFlagged: rows[0]?.stores ?? 0, signals: rows[0]?.signals ?? 0 };
}

export type RiskLevel = "low" | "medium" | "high";

export interface PhoneRiskVerdict {
  level: RiskLevel;
  /** i18n reason keys, in severity order, for the UI to render. */
  reasons: string[];
}

function rank(l: RiskLevel): number {
  return l === "high" ? 2 : l === "medium" ? 1 : 0;
}

// Composite scoring over local history + the optional external lookup + the
// cross-tenant network. Pure — reused by the order detail panel, the order list
// and (later) the confirm-time guard. Reasons are i18n keys.
export function scorePhoneRisk(input: {
  local: OrderRiskSignals;
  external?: ExternalPhoneRisk;
  network?: NetworkPhoneRisk;
}): PhoneRiskVerdict {
  const { local, external, network } = input;
  const reasons: string[] = [];
  let level: RiskLevel = "low";
  const bump = (l: RiskLevel) => {
    if (rank(l) > rank(level)) level = l;
  };

  if (local.blocked) {
    bump("high");
    reasons.push("blocked");
  }
  if (local.duplicateRecent > 0) {
    bump("high");
    reasons.push("duplicate");
  }
  if (local.priorOrders >= 2 && local.rtoRate > 0.4) {
    bump("high");
    reasons.push("rto");
  } else if (local.priorOrders >= 2 && local.rtoRate >= 0.2) {
    bump("medium");
    reasons.push("rto");
  }
  if (network) {
    if (network.storesFlagged >= 2) {
      bump("high");
      reasons.push("network");
    } else if (network.storesFlagged === 1) {
      bump("medium");
      reasons.push("network");
    }
  }
  if (external?.configured && external.successRatio !== undefined) {
    if (external.successRatio < 0.5) {
      bump("high");
      reasons.push("courier");
    } else if (external.successRatio < 0.7) {
      bump("medium");
      reasons.push("courier");
    }
  }
  return { level, reasons };
}

// ---- External phone-risk lookup (credential-gated adapter) ------------------
export interface ExternalPhoneRisk {
  configured: boolean;
  /** Courier delivery-success ratio if the provider returns one (0–1). */
  successRatio?: number;
  totalParcels?: number;
  totalDelivered?: number;
  totalCancelled?: number;
  provider?: string;
}

// FraudChecker-style API: POST phone, get aggregate courier history. Gated by
// FRAUDCHECKER_API_KEY (absent for now, like the other live integrations). No
// fabricated data when unconfigured — returns { configured:false }.
export async function getExternalPhoneRisk(phone: string): Promise<ExternalPhoneRisk> {
  const apiKey = process.env.FRAUDCHECKER_API_KEY;
  const endpoint = process.env.FRAUDCHECKER_API_URL;
  if (!apiKey || !endpoint) return { configured: false };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { configured: true, provider: "fraudchecker" };
    const data = (await res.json()) as {
      total_parcel?: number;
      total_delivered?: number;
      total_cancel?: number;
    };
    const total = data.total_parcel ?? 0;
    const delivered = data.total_delivered ?? 0;
    return {
      configured: true,
      provider: "fraudchecker",
      totalParcels: total,
      totalDelivered: delivered,
      totalCancelled: data.total_cancel ?? 0,
      successRatio: total > 0 ? delivered / total : undefined,
    };
  } catch {
    // Network/timeout — fail open to the internal signals; never block on it.
    return { configured: true, provider: "fraudchecker" };
  }
}
