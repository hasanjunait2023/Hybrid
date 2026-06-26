"use server";

// Order note + assignment server actions. Notes are tenant-scoped via RLS
// and visible to all members of the tenant. Assignments are operator handoff:
// "Rahim is packing order #42".

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { recordAudit } from "@/lib/audit/record";

const NoteSchema = z.object({
  orderId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

const AssignSchema = z.object({
  orderId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
});

async function authMember(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

export interface NoteResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export async function addOrderNote(orderId: string, body: string): Promise<NoteResult> {
  const auth = await authMember();
  if (!auth.ok) return auth;
  const parsed = NoteSchema.safeParse({ orderId, body });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "অবৈধ ইনপুট।" };
  }

  // Verify the order belongs to this tenant first (defense-in-depth — RLS would
  // also catch it, but a clean error is friendlier).
  const ownership = await withTenant(auth.tenantId, auth.userId, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      select id from orders where id = ${parsed.data.orderId} limit 1
    `;
    return rows.length > 0;
  });
  if (!ownership) {
    return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
  }

  const id = await withTenant(auth.tenantId, auth.userId, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into order_note (tenant_id, order_id, author_id, body)
      values (app.current_tenant_id(), ${parsed.data.orderId}, app.current_user_id(), ${parsed.data.body})
      returning id
    `;
    return rows[0]?.id;
  });

  revalidateTag(`tenant:${auth.tenantId}:order:${parsed.data.orderId}`);
  revalidateTag(`tenant:${auth.tenantId}:orders`);
  await recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "settings.update",
    resourceType: "order_note",
    resourceId: parsed.data.orderId,
    details: { noteId: id },
  });

  return { ok: true, id };
}

export async function assignOrder(
  orderId: string,
  assigneeId: string | null,
): Promise<NoteResult> {
  const auth = await authMember();
  if (!auth.ok) return auth;
  const parsed = AssignSchema.safeParse({ orderId, assigneeId });
  if (!parsed.success) return { ok: false, error: "অবৈধ অনুরোধ।" };

  // If assigning, verify the assignee belongs to this tenant.
  if (parsed.data.assigneeId) {
    const memberOk = await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ user_id: string }[]>`
        select user_id from tenant_member
        where tenant_id = app.current_tenant_id() and user_id = ${parsed.data.assigneeId}
        limit 1
      `;
      return rows.length > 0;
    });
    if (!memberOk) {
      return { ok: false, error: "প্রাপক এই স্টোরের সদস্য নয়।" };
    }
  }

  await withTenant(auth.tenantId, auth.userId, async (tx) => {
    await tx`
      update orders
         set assignee_id = ${parsed.data.assigneeId},
             assigned_at = ${parsed.data.assigneeId ? new Date() : null},
             updated_at = now()
       where id = ${parsed.data.orderId}
    `;
  });

  revalidateTag(`tenant:${auth.tenantId}:order:${parsed.data.orderId}`);
  revalidateTag(`tenant:${auth.tenantId}:orders`);
  revalidateTag(`tenant:${auth.tenantId}:dashboard`);
  await recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "settings.update",
    resourceType: "order",
    resourceId: parsed.data.orderId,
    details: { assigneeId: parsed.data.assigneeId },
  });

  return { ok: true };
}

export interface OrderNote {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export async function listOrderNotes(orderId: string): Promise<OrderNote[]> {
  const auth = await authMember();
  if (!auth.ok) return [];
  return withTenant(auth.tenantId, auth.userId, async (tx) => {
    const rows = await tx<
      { id: string; body: string; author_name: string | null; created_at: string }[]
    >`
      select
        n.id,
        n.body,
        coalesce(u.full_name, u.email) as author_name,
        n.created_at
      from order_note n
      left join app_user u on u.id = n.author_id
      where n.order_id = ${orderId}
      order by n.created_at desc
      limit 50
    `;
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      authorName: r.author_name,
      createdAt: r.created_at,
    }));
  });
}
