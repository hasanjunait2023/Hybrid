"use client";

import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import { approveKyc, rejectKyc, type PlatformActionResult } from "./actions";

interface KycActionsProps {
  tenantId: string;
  kycStatus: string;
}

// Per-row KYC action buttons: Approve / Reject. Runs as Server Actions with
// server-side authz re-check. On success the page revalidates.
export function KycActions({ tenantId, kycStatus }: KycActionsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isRejected = kycStatus === "rejected";
  const isVerified = kycStatus === "verified";

  function run(
    action: (id: string) => Promise<PlatformActionResult>,
  ): void {
    setError(null);
    startTransition(async () => {
      const res = await action(tenantId);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  // Already final — no actions to show
  if (isVerified || isRejected) {
    return (
      <span className="text-[11px] font-medium text-[var(--pf-muted)]">
        {isVerified ? "Approved" : "Rejected"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() => run(approveKyc)}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => run(rejectKyc)}
        >
          Reject
        </Button>
      </div>
      {error && <span className="text-[11px] text-[var(--pf-danger)]">{error}</span>}
    </div>
  );
}
