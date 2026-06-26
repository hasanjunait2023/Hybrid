// Server wrapper that fetches notes + team members and renders the client
// panel. Lives as a separate file so the client component stays pure.

import { listOrderNotes } from "./notes-actions";
import { listMembers } from "@/lib/admin/staff";
import { OrderNotesPanel, type ExistingNote } from "./OrderNotesPanel";

export async function OrderNotesPanelWrapper({
  orderId,
}: {
  orderId: string;
  locale: string;
}) {
  const [notes, members] = await Promise.all([
    listOrderNotes(orderId),
    listMembersForTenant(),
  ]);

  const initialNotes: ExistingNote[] = notes.map((n) => ({
    id: n.id,
    body: n.body,
    authorName: n.authorName,
    createdAt: n.createdAt,
  }));

  const currentAssigneeId = null;
  // FEATURE-DEFERRED (orders.assignee_id read): the column exists in the
  // schema (see migration 19_order_assignee.sql) and the staff panel reads it,
  // but the order-detail data layer hasn't been wired to select it yet. This
  // panel intentionally defaults the dropdown to 'unassigned' until that query
  // is updated — the on-change handler still POSTs the assigned userId correctly.
  // Tracked: BACKLOG.md (returns shipped — assignee read is the next W2.x slice).

  return (
    <OrderNotesPanel
      orderId={orderId}
      notes={initialNotes}
      members={members}
      currentAssigneeId={currentAssigneeId}
      canManage={true}
    />
  );
}

async function listMembersForTenant() {
  const { getActiveTenantId } = await import("@/lib/admin/data");
  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession();
  if (!session) return [];
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return [];
  const all = await listMembers(tenantId);
  return all.map((m) => ({
    id: m.userId,
    fullName: m.fullName,
    email: m.email,
    role: m.role,
  }));
}