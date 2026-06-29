import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listTasks, type TaskListFilter } from "@/lib/admin/tasks";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { CreateTaskForm, TaskRowActions } from "./TaskControls";

// CRM tasks & follow-ups (Phase R1.2). Staff to-dos — call backs, COD confirms,
// follow-ups — with due dates, priority and optional customer/order links.
export const dynamic = "force-dynamic";

const FILTERS: TaskListFilter[] = ["open", "done", "all"];

export default async function TasksPage(props: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await props.searchParams;
  const filter: TaskListFilter = FILTERS.includes(sp.filter as TaskListFilter)
    ? (sp.filter as TaskListFilter)
    : "open";

  const tasks = await listTasks(tenantId, session.userId, filter);
  const { locale, d } = await getDict();
  const t = d.admin.tasks;

  const filterLabel: Record<TaskListFilter, string> = {
    open: t.filterOpen,
    done: t.filterDone,
    all: t.filterAll,
  };
  const prioLabel = (p: string) =>
    p === "high" ? t.priority.high : p === "low" ? t.priority.low : t.priority.normal;
  const prioCls = (p: string) =>
    p === "high"
      ? "bg-danger-weak text-danger"
      : p === "low"
        ? "bg-surface-2 text-ink-muted"
        : "bg-primary-weak text-primary";

  const fmtDue = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Dhaka",
        }).format(new Date(iso))
      : t.noDue;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <p className="text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      <CreateTaskForm t={t} />

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/tasks?filter=${f}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f ? "bg-ink text-surface" : "bg-surface-2 text-ink-muted hover:text-ink"
            }`}
          >
            {filterLabel[f]}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {tasks.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-ink-muted">{t.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`text-sm font-semibold ${task.status === "done" ? "text-ink-subtle line-through" : "text-ink"}`}
                    >
                      {task.title}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${prioCls(task.priority)}`}>
                      {prioLabel(task.priority)}
                    </span>
                    {task.overdue && (
                      <span className="rounded-full bg-danger-weak px-2 py-0.5 text-2xs font-semibold text-danger">
                        {t.overdue}
                      </span>
                    )}
                  </div>
                  {task.note && <p className="mt-0.5 text-xs text-ink-muted">{task.note}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-subtle">
                    <span>🕑 {fmtDue(task.dueAt)}</span>
                    {task.customerId && (
                      <Link href={`/admin/customers/${task.customerId}`} className="text-primary hover:underline">
                        {task.customerName ?? "—"}
                      </Link>
                    )}
                    {task.orderId && task.orderNumber !== null && (
                      <Link href={`/admin/orders/${task.orderId}`} className="font-mono text-primary tnum hover:underline">
                        #{formatNumber(task.orderNumber, locale)}
                      </Link>
                    )}
                  </div>
                </div>
                <TaskRowActions id={task.id} done={task.status === "done"} t={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
