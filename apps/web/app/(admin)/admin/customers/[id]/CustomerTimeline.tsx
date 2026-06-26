// Customer profile timeline widgets — monthly spend chart + communication log.
// Server-rendered, zero client JS. Bilingual labels.

import type { Locale } from "@/lib/i18n/config";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { timeAgo } from "@/lib/admin/format";

/** 12-month spend timeline. Simple bar chart with month labels. */
export function MonthlySpendChart({
  data,
  locale = "en",
  emptyLabel = "No purchases yet",
}: {
  data: { month: string; orders: number; spent: number }[];
  locale?: Locale;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.spent));
  const hasData = data.some((d) => d.spent > 0);
  if (!hasData) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {locale === "bn" ? "মাসিক খরচ (১২ মাস)" : "Monthly spend (12 months)"}
        </h3>
        <p className="mt-6 text-center text-sm text-ink-subtle">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {locale === "bn" ? "মাসিক খরচ (১২ মাস)" : "Monthly spend (12 months)"}
      </h3>
      <div className="mt-4 flex h-32 items-end gap-1">
        {data.map((d) => {
          const pct = d.spent > 0 ? Math.max(4, (d.spent / max) * 100) : 2;
          const monthLabel = new Date(d.month + "T00:00:00+06:00").toLocaleDateString(
            "en-GB",
            { month: "short", timeZone: "Asia/Dhaka" },
          );
          return (
            <div key={d.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="relative flex w-full flex-1 items-end" title={`${monthLabel}: ${formatMoney(d.spent, locale)}`}>
                <div
                  className={`w-full rounded-t-sm ${d.spent > 0 ? "bg-primary" : "bg-surface-2"}`}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className="text-2xs text-ink-subtle">{monthLabel}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-2xs text-ink-subtle">
        <span>{locale === "bn" ? "সর্বোচ্চ" : "Peak"}: {formatMoney(max, locale)}</span>
        <span>{locale === "bn" ? "গড়" : "Avg"}: {formatMoney(data.reduce((s, d) => s + d.spent, 0) / data.length, locale)}</span>
      </div>
    </div>
  );
}

/** Communication log: last 20 SMS/email sent to this customer. */
export function CommunicationLog({
  items,
  locale = "en",
  emptyLabel = "No messages sent",
}: {
  items: {
    channel: "sms" | "email";
    templateKey: string;
    sentAt: string;
    status: string;
  }[];
  locale?: Locale;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {locale === "bn" ? "যোগাযোগ ইতিহাস" : "Communication log"}
        </h3>
        <p className="mt-6 text-center text-sm text-ink-subtle">{emptyLabel}</p>
      </div>
    );
  }

  const ICON: Record<"sms" | "email", string> = { sms: "💬", email: "✉️" };
  const TONE: Record<string, string> = {
    delivered: "text-success",
    sent: "text-info",
    failed: "text-danger",
    bounced: "text-warning",
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {locale === "bn" ? "যোগাযোগ ইতিহাস" : "Communication log"}
      </h3>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {items.map((it, i) => (
          <li key={`${it.sentAt}-${i}`} className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5">{ICON[it.channel]}</span>
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-mono text-2xs text-ink-muted">
                  {it.templateKey}
                </span>
                {" · "}
                <span className={TONE[it.status] ?? "text-ink-subtle"}>
                  {it.status}
                </span>
              </p>
              <p className="text-2xs text-ink-subtle">
                {formatNumber(new Date(it.sentAt).getDate(), locale)}/
                {formatNumber(new Date(it.sentAt).getMonth() + 1, locale)} ·{" "}
                {timeAgo(it.sentAt, locale)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}