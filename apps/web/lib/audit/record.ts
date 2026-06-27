import { asPlatformAdmin } from "@hybrid/db";
import type { Tx } from "@hybrid/db";

// Append-only audit log helper. Always inserts via asPlatformAdmin because
// audit rows may need to outlive tenant deletion (CASCADE keeps them) and
// because the actor might be a platform admin acting on another tenant.
//
// Best-effort: audit logging MUST never break the calling action. A
// failure is logged to stderr and swallowed.

type JsonValue = Parameters<Tx["json"]>[0];

export type AuditAction =
  | "settings.update"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "order.refund"
  | "order.cancel"
  | "member.invite"
  | "member.remove"
  | "member.role_change"
  | "payment_account.update"
  | "tenant.suspend"
  | "tenant.reactivate"
  | "tenant.plan_change"
  | "platform_admin.login"
  | "dbid.review_approve"
  | "dbid.review_reject";

export interface AuditEntry {
  tenantId?: string | null;
  actorUserId: string | null;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: JsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await asPlatformAdmin(async (tx) => {
      await tx`
        insert into audit_log (
          tenant_id, actor_user_id, action,
          resource_type, resource_id, details,
          ip_address, user_agent
        ) values (
          ${entry.tenantId ?? null}::uuid,
          ${entry.actorUserId}::uuid,
          ${entry.action},
          ${entry.resourceType ?? null},
          ${entry.resourceId ?? null},
          ${tx.json(entry.details ?? {})},
          ${entry.ipAddress ?? null}::inet,
          ${entry.userAgent ?? null}
        )
      `;
    });
  } catch (err) {
    // Audit must never break the caller. Surface the failure so it shows
    // up in monitoring, but do not throw.
    console.error("[audit] recordAudit failed:", err);
  }
}

export type AuditRow = {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  occurredAt: Date;
};

/**
 * Recent audit entries for a tenant. Tenant admins see their own rows;
 * platform admins see everything. RLS does the filtering — we don't
 * pass a tenant filter at the query level.
 */
export async function getRecentAudit(limit = 200): Promise<AuditRow[]> {
  const rows = await asPlatformAdmin(async (tx) => {
    const r = await tx<
      {
        id: string;
        tenant_id: string | null;
        actor_user_id: string | null;
        action: AuditAction;
        resource_type: string | null;
        resource_id: string | null;
        details: Record<string, unknown>;
        occurred_at: Date;
      }[]
    >`
      select id, tenant_id, actor_user_id, action,
             resource_type, resource_id, details, occurred_at
        from audit_log
       order by occurred_at desc
       limit ${limit}
    `;
    return r;
  });
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    actorUserId: r.actor_user_id,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    details: (r.details ?? {}) as Record<string, unknown>,
    occurredAt: r.occurred_at,
  }));
}