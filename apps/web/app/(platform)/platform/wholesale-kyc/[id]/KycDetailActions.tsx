"use client";

import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import { approveKyc, rejectKyc, type PlatformActionResult } from "../actions";

interface KycDetailActionsProps {
  tenantId: string;
  kycStatus: string;
  wholesaleApproved: boolean;
}

// Detail-page KYC action buttons: Approve / Reject with a notes field for
// rejection reason. Runs as Server Actions with server-side authz re-check.
export function KycDetailActions({
  tenantId,
  kycStatus,
  wholesaleApproved,
}: KycDetailActionsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const isFinal = kycStatus === "verified" || kycStatus === "rejected";

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveKyc(tenantId);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectKyc(tenantId);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  if (isFinal) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center rounded-full bg-[#f0ede4] px-3 py-1.5 text-[12px] font-semibold text-[var(--pf-muted)]">
          {kycStatus === "verified" ? "✓ Approved" : "✗ Rejected"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={handleApprove}
        >
          Approve KYC
        </Button>
        {showRejectForm ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => setShowRejectForm(false)}
          >
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => setShowRejectForm(true)}
          >
            Reject
          </Button>
        )}
      </div>

      {showRejectForm && (
        <div className="flex w-full flex-col gap-2 rounded-xl border border-[var(--pf-border)] bg-[#fbf9f2] p-3">
          <label className="text-[12px] font-medium text-[var(--pf-muted)]">
            Rejection reason (optional)
          </label>
          <textarea
            className="w-full rounded-lg border border-[var(--pf-border)] bg-white px-3 py-2 text-[13px] text-[var(--pf-ink)] outline-none focus:border-[var(--pf-yellow)]"
            rows={2}
            placeholder="Enter reason for rejection..."
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={handleReject}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      )}

      {error && (
        <span className="text-[11px] text-[var(--pf-danger)]">{error}</span>
      )}
    </div>
  );
}
