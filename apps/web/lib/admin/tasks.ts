// CRM tasks & follow-ups data layer (admin, Phase R1.2). A task is a staff
// to-do — "call back", "confirm COD", "follow up quote" — optionally pinned to a
// customer and/or order, with a due date, priority and status. All reads/writes
// via withTenant (RLS). The dashboard surfaces what is due today / overdue so
// nothing slips through the cracks.
import { withTenant } from "@hybrid/db";

export type TaskStatus = "open" | "done";
export type TaskPriority = "low" | "normal" | "high";

export interface CrmTaskRow {
  id: string;
  title: string;
  note: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  customerId: string | null;
  customerName: string | null;
  orderId: string | null;
  orderNumber: number | null;
  completedAt: string | null;
  createdAt: string;
  /** open AND past its due date — the "act now" flag. */
  overdue: boolean;
}

interface TaskJoinRow {
  id: string;
  title: string;
  note: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  customer_id: string | null;
  customer_name: string | null;
  order_id: string | null;
  order_number: string | null;
  completed_at: string | null;
  created_at: string;
  overdue: boolean;
}

function toRow(r: TaskJoinRow): CrmTaskRow {
  return {
    id: r.id,
    title: r.title,
    note: r.note,
    status: r.status as TaskStatus,
    priority: r.priority as TaskPriority,
    dueAt: r.due_at,
    customerId: r.customer_id,
    customerName: r.customer_name,
    orderId: r.order_id,
    orderNumber: r.order_number !== null ? Number(r.order_number) : null,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    overdue: r.overdue,
  };
}

export type TaskListFilter = "open" | "done" | "all";

export async function listTasks(
  tenantId: string,
  userId: string,
  filter: TaskListFilter = "open",
): Promise<CrmTaskRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<TaskJoinRow[]>`
      select t.id, t.title, t.note, t.status, t.priority, t.due_at,
             t.customer_id, c.name as customer_name,
             t.order_id, o.order_number, t.completed_at, t.created_at,
             (t.status = 'open' and t.due_at is not null and t.due_at < now()) as overdue
        from crm_task t
        left join customer c on c.id = t.customer_id
        left join orders o on o.id = t.order_id
       where (${filter} = 'all' or t.status = ${filter})
       order by
         case when t.status = 'open' then 0 else 1 end,
         t.due_at asc nulls last,
         t.created_at desc
       limit 300
    `,
  );
  return rows.map(toRow);
}

export interface CreateTaskInput {
  title: string;
  note?: string | null;
  priority?: TaskPriority;
  /** ISO datetime or null. */
  dueAt?: string | null;
  customerId?: string | null;
  orderId?: string | null;
}

export async function createTask(
  tenantId: string,
  userId: string,
  input: CreateTaskInput,
): Promise<{ id: string }> {
  const title = input.title.trim();
  const note = input.note?.trim() || null;
  const priority: TaskPriority = input.priority ?? "normal";
  const dueAt = input.dueAt || null;
  const customerId = input.customerId || null;
  const orderId = input.orderId || null;

  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      insert into crm_task (tenant_id, title, note, priority, due_at, customer_id, order_id, created_by)
      values (${tenantId}, ${title}, ${note}, ${priority}, ${dueAt}, ${customerId}, ${orderId}, ${userId})
      returning id
    `,
  );
  return { id: rows[0]!.id };
}

// Toggle done/open. Stamps completed_at on done, clears it on reopen.
export async function setTaskStatus(
  tenantId: string,
  userId: string,
  id: string,
  status: TaskStatus,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    if (status === "done") {
      await tx`
        update crm_task set status = 'done', completed_at = now()
         where id = ${id} and tenant_id = ${tenantId}
      `;
    } else {
      await tx`
        update crm_task set status = 'open', completed_at = null
         where id = ${id} and tenant_id = ${tenantId}
      `;
    }
  });
}

export async function deleteTask(
  tenantId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`delete from crm_task where id = ${id} and tenant_id = ${tenantId}`;
  });
}

export interface TaskSummary {
  open: number;
  dueToday: number;
  overdue: number;
  /** the next few open tasks (overdue + soonest due first) for the widget. */
  upcoming: CrmTaskRow[];
}

// Dashboard "Today" widget feed — counts + the most pressing open tasks.
export async function getTaskSummary(
  tenantId: string,
  userId: string,
): Promise<TaskSummary> {
  return withTenant(tenantId, userId, async (tx) => {
    const counts = await tx<{ open: number; due_today: number; overdue: number }[]>`
      select
        count(*) filter (where status = 'open')::int as open,
        count(*) filter (
          where status = 'open' and due_at is not null
            and (due_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date
        )::int as due_today,
        count(*) filter (where status = 'open' and due_at is not null and due_at < now())::int as overdue
      from crm_task
    `;
    const upcoming = await tx<TaskJoinRow[]>`
      select t.id, t.title, t.note, t.status, t.priority, t.due_at,
             t.customer_id, c.name as customer_name,
             t.order_id, o.order_number, t.completed_at, t.created_at,
             (t.due_at is not null and t.due_at < now()) as overdue
        from crm_task t
        left join customer c on c.id = t.customer_id
        left join orders o on o.id = t.order_id
       where t.status = 'open'
       order by (t.due_at is null) asc, t.due_at asc
       limit 5
    `;
    const c = counts[0];
    return {
      open: c?.open ?? 0,
      dueToday: c?.due_today ?? 0,
      overdue: c?.overdue ?? 0,
      upcoming: upcoming.map(toRow),
    };
  });
}
