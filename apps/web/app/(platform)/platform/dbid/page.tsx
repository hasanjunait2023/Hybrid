import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { isPlatformAdmin } from "@/lib/platform/auth";
import {
  listDbidQueue,
  getDbidQueueStats,
  type DbidStatus,
} from "@/lib/platform/dbid-review";
import { DbidReviewRow } from "@/components/platform/DbidReviewRow";

// Platform DBID reviewer queue (S2.C5.v1).
//
// Lists every DBID submission across all tenants, filterable by status.
// Submitted rows appear first because they're the reviewer's primary work.
// Each row shows: tenant name + slug, business identity (last-4 hints for
// documents), status, and action buttons (Approve / Reject).
//
// The "review" link opens a per-row detail view (not implemented in this
// iteration — the inline form on each row is enough for a 1-day turnaround
// cycle on ~100 pending submissions).

interface PageProps {
  // Next.js 15+ App Router: searchParams is a Promise. Must await it.
  searchParams?: Promise<{ status?: string; q?: string }>;
}

export default async function PlatformDbidPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!(await isPlatformAdmin(session.userId))) {
    redirect("/platform");
  }

  const sp = (await searchParams) ?? {};
  const statusParam = (sp.status ?? "submitted") as
    | DbidStatus
    | "all";
  const search = (sp.q ?? "").trim();

  const [rows, stats] = await Promise.all([
    listDbidQueue({ status: statusParam, search }),
    getDbidQueueStats(),
  ]);

  return (
    <div className="space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-bold">DBID Compliance — Reviewer Queue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Review and approve Bangladesh Digital Business ID applications
          submitted by tenants. Approving issues the official 17-digit DBID
          number; rejecting requires notes the seller sees on re-submit.
        </p>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Submitted" value={stats.submitted} accent="blue" />
        <Stat label="In progress" value={stats.in_progress} accent="amber" />
        <Stat label="Approved" value={stats.approved} accent="emerald" />
        <Stat label="Rejected" value={stats.rejected} accent="rose" />
        <Stat label="Total" value={stats.total} accent="neutral" />
      </div>

      {/* Filter bar */}
      <form className="flex flex-wrap items-center gap-2" action="/platform/dbid">
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1">
          {(["submitted", "rejected", "approved", "in_progress", "all"] as const).map(
            (s) => (
              <a
                key={s}
                href={`/platform/dbid?status=${s}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                className={`rounded px-3 py-1 text-sm font-medium ${
                  statusParam === s
                    ? "bg-primary text-white"
                    : "text-ink-muted hover:bg-surface-2"
                }`}
              >
                {s.replace("_", " ")}
              </a>
            ),
          )}
        </div>
        <input
          name="q"
          defaultValue={search}
          placeholder="Search tenant name or slug..."
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        />
        <input type="hidden" name="status" value={statusParam} />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white"
        >
          Search
        </button>
      </form>

      {/* Queue list */}
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-md border border-border bg-surface p-6 text-center text-sm text-ink-muted">
            No submissions match this filter.
          </p>
        ) : (
          rows.map((row) => <DbidReviewRow key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "blue" | "amber" | "emerald" | "rose" | "neutral";
}) {
  const colors: Record<typeof accent, string> = {
    blue: "bg-blue-50 text-blue-900",
    amber: "bg-amber-50 text-amber-900",
    emerald: "bg-emerald-50 text-emerald-900",
    rose: "bg-rose-50 text-rose-900",
    neutral: "bg-surface-2 text-ink",
  };
  return (
    <div className={`rounded-lg border border-border p-3 ${colors[accent]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}