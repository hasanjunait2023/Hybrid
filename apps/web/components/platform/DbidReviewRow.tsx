"use client";

// Per-row reviewer card. Shows the tenant + business identity + action
// forms. Inline approve + reject forms use the parent page's Server
// Actions; after a successful save we router.refresh() to re-read the
// queue (cheap — only the affected row's status changes).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveDbid, rejectDbid } from "@/app/(platform)/platform/dbid/actions";
import type { DbidReviewRow } from "@/lib/platform/dbid-review";

const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-surface-2 text-ink-muted",
  in_progress: "bg-amber-100 text-amber-900",
  submitted: "bg-blue-100 text-blue-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

export function DbidReviewRow({ row }: { row: DbidReviewRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApprove(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await approveDbid(null, fd);
      if (!result.ok) setError(result.error ?? "Failed");
      else router.refresh();
    });
  }

  function handleReject(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await rejectDbid(null, fd);
      if (!result.ok) setError(result.error ?? "Failed");
      else router.refresh();
    });
  }

  const reviewable = row.status === "submitted" || row.status === "rejected";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <a
              href={`/platform/tenants/${row.tenantId}`}
              className="text-base font-semibold text-ink hover:text-primary"
            >
              {row.tenantName}
            </a>
            <span className="text-xs text-ink-muted">({row.tenantSlug})</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status] ?? "bg-surface-2"}`}
            >
              {row.status.replace("_", " ")}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <Field label="Business" value={row.businessName ?? "—"} />
            <Field
              label="Type"
              value={row.businessType ? row.businessType.replace("_", " ") : "—"}
            />
            <Field label="Owner" value={row.ownerFullName ?? "—"} />
            <Field label="DOB" value={row.ownerDob ?? "—"} />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <Field label="NID" value={row.nidLast4 ? `••••${row.nidLast4}` : "—"} mono />
            <Field label="TIN" value={row.tinLast4 ? `••••${row.tinLast4}` : "—"} mono />
            <Field
              label="Trade Lic."
              value={row.tradeLicenseLast4 ? `••••${row.tradeLicenseLast4}` : "—"}
              mono
            />
            <Field
              label="BIN"
              value={row.binLast4 ? `••••${row.binLast4}` : "—"}
              mono
            />
          </div>

          {row.dbidNumber && (
            <div className="mt-2 text-sm">
              <span className="font-semibold text-ink">DBID number: </span>
              <span className="font-mono text-ink">{row.dbidNumber}</span>
              {row.expiresAt && (
                <span className="ml-3 text-ink-muted">
                  expires {new Date(row.expiresAt).toLocaleDateString("en-GB")}
                </span>
              )}
            </div>
          )}

          {row.reviewerNotes && (
            <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              <span className="font-semibold">Reviewer notes: </span>
              {row.reviewerNotes}
            </div>
          )}

          {row.submittedAt && (
            <div className="mt-1 text-xs text-ink-muted">
              Submitted {new Date(row.submittedAt).toLocaleString("en-GB")}
            </div>
          )}
        </div>

        {/* Actions */}
        {reviewable && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[280px]">
            <ApproveForm rowId={row.id} onSubmit={handleApprove} pending={pending} />
            <RejectForm rowId={row.id} onSubmit={handleReject} pending={pending} />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className={`block text-ink ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function ApproveForm({
  rowId,
  onSubmit,
  pending,
}: {
  rowId: string;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [dbidNumber, setDbidNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("submissionId", rowId);
        fd.set("dbidNumber", dbidNumber);
        fd.set("expiresAt", expiresAt);
        onSubmit(fd);
      }}
      className="rounded-md border border-emerald-200 bg-emerald-50 p-3"
    >
      <p className="mb-2 text-xs font-semibold text-emerald-900">Approve + issue DBID number</p>
      <input
        type="text"
        required
        placeholder="17-digit DBID number"
        inputMode="numeric"
        pattern="^\d{15,20}$"
        value={dbidNumber}
        onChange={(e) => setDbidNumber(e.target.value)}
        className="mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm font-mono"
      />
      <input
        type="date"
        placeholder="Expires (optional)"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        className="mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending || dbidNumber.length < 15}
        className="w-full rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "..." : "Approve"}
      </button>
    </form>
  );
}

function RejectForm({
  rowId,
  onSubmit,
  pending,
}: {
  rowId: string;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("submissionId", rowId);
        fd.set("reviewerNotes", notes);
        onSubmit(fd);
      }}
      className="rounded-md border border-rose-200 bg-rose-50 p-3"
    >
      <p className="mb-2 text-xs font-semibold text-rose-900">Reject with notes</p>
      <textarea
        required
        minLength={10}
        placeholder="Why is this rejected? Seller sees this on re-submit..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="mb-2 w-full rounded border border-rose-300 bg-white px-2 py-1 text-sm"
        rows={2}
      />
      <button
        type="submit"
        disabled={pending || notes.length < 10}
        className="w-full rounded bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
      >
        {pending ? "..." : "Reject"}
      </button>
    </form>
  );
}