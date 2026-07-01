import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { getRecentTrackingEvents, getTrackingSummary } from "@/lib/analytics/log";

// Tracking dashboard — shows the last 200 server-side tracking events
// delivered (or failed) for this tenant, plus a 24h summary header.
//
// Server-rendered; no client JS needed for the table. Refresh = re-render.

export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [summary, rows] = await Promise.all([
    getTrackingSummary(tenantId, session.userId),
    getRecentTrackingEvents(tenantId, session.userId, 200),
  ]);
  const { d } = await getDict();
  const t = d.admin.settingsComms;

  return (
    <div className="max-w-5xl space-y-5">
      <a
        href="/admin/settings"
        className="text-sm font-medium text-ink-muted hover:text-primary"
      >
        ← {t.settingsLink}
      </a>

      <header>
        <h1 className="text-xl font-bold text-ink">
          {t.analytics?.title ?? "Tracking & Analytics"}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every server-side conversion event we sent (or tried to send) for your
          store, with delivery status. The browser pixel fires separately and is
          not logged here.
        </p>
      </header>

      {/* 24h summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile
          label="Sent (24h)"
          value={summary.last24h.sent}
          tone="ok"
        />
        <SummaryTile
          label="Failed (24h)"
          value={summary.last24h.failed}
          tone={summary.last24h.failed > 0 ? "warn" : "muted"}
        />
        <SummaryTile
          label="Skipped (24h)"
          value={summary.last24h.skipped}
          tone="muted"
          hint="Consent denied or duplicate dedup"
        />
      </div>

      {/* Event log table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">HTTP</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                  No events yet. Once your first order confirms, server-side
                  tracking will appear here.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-subtle">
                    {new Date(r.occurredAt).toLocaleString("en-GB", {
                      hour12: false,
                    })}
                  </td>
                  <td className="px-3 py-2 font-medium text-ink">
                    {r.eventName}
                  </td>
                  <td className="px-3 py-2 capitalize text-ink-muted">
                    {r.platform}
                  </td>
                  <td className="px-3 py-2 text-ink-subtle">{r.source}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-subtle">
                    {r.responseCode ?? "—"}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-ink-subtle">
                    {r.errorMessage ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "muted";
  hint?: string;
}) {
  const colors =
    tone === "ok"
      ? "border-border bg-success-weak text-success"
      : tone === "warn"
        ? "border-border bg-warning-weak text-warning"
        : "border-border bg-surface-2 text-ink-muted";
  return (
    <div className={`rounded-xl border p-4 ${colors}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs opacity-60">{hint}</div> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-success-weak text-success border-border",
    failed: "bg-danger-weak text-danger border-border",
    skipped_consent: "bg-surface-2 text-ink-muted border-border",
    duplicate: "bg-surface-2 text-ink-muted border-border",
  };
  const cls = map[status] ?? "bg-surface-2 text-ink-muted border-border";
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {status}
    </span>
  );
}
