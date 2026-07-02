// Dashboard "Today's tasks" widget (CRM Phase R1.2). Server-rendered, zero
// client JS. Surfaces the most pressing open follow-ups (overdue + soonest due
// first) with overdue/due-today counts so nothing slips. Hidden when there are
// no open tasks, to keep the morning-glance dashboard calm.
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionaries";
import type { TaskSummary } from "@/lib/admin/tasks";
import { formatNumber } from "@/lib/i18n/format";

export function TasksTodayWidget({
  summary,
  t,
  locale,
}: {
  summary: TaskSummary;
  t: Messages["admin"]["tasks"];
  locale: Locale;
}) {
  if (summary.open === 0) return null;

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
    <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-ink">{t.widgetTitle}</h2>
          {summary.overdue > 0 && (
            <span className="rounded-full bg-danger-weak px-2 py-0.5 text-2xs font-semibold text-danger">
              {formatNumber(summary.overdue, locale)} {t.widgetOverdue}
            </span>
          )}
          {summary.dueToday > 0 && (
            <span className="rounded-full bg-primary-weak px-2 py-0.5 text-2xs font-semibold text-primary">
              {formatNumber(summary.dueToday, locale)} {t.widgetDueToday}
            </span>
          )}
        </div>
        <Link href="/admin/tasks" className="text-2xs font-semibold text-primary hover:underline">
          {t.viewAll} →
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {summary.upcoming.map((task) => (
          <li key={task.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{task.title}</span>
            {task.overdue && (
              <span className="rounded-full bg-danger-weak px-1.5 py-0.5 text-2xs font-semibold text-danger">
                {t.overdue}
              </span>
            )}
            <span className="shrink-0 text-2xs text-ink-subtle">{fmtDue(task.dueAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
