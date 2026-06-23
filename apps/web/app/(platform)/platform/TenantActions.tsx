"use client";

import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import {
  suspendTenant,
  reactivateTenant,
  impersonateTenantOwner,
  type PlatformActionResult,
} from "./actions";

interface TenantActionsProps {
  tenantId: string;
  status: string;
  rootDomain: string;
}

// Per-row super-admin controls: suspend/reactivate + impersonate. Mutations run
// as Server Actions (authz re-checked server-side). After impersonate succeeds
// the operator is sent to the admin host so they land in that tenant's admin.
export function TenantActions({ tenantId, status, rootDomain }: TenantActionsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isSuspended = status === "suspended";

  function run(
    action: (id: string) => Promise<PlatformActionResult>,
    after?: () => void,
  ): void {
    setError(null);
    startTransition(async () => {
      const res = await action(tenantId);
      if (!res.ok) {
        setError(res.error ?? "একটি সমস্যা হয়েছে।");
        return;
      }
      after?.();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(impersonateTenantOwner, () => {
              // Land on the admin host as the impersonated owner.
              window.location.href = `${window.location.protocol}//admin.${rootDomain}${
                window.location.port ? `:${window.location.port}` : ""
              }/admin`;
            })
          }
        >
          ইমপারসোনেট
        </Button>
        {isSuspended ? (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => run(reactivateTenant)}>
            পুনরায় চালু
          </Button>
        ) : (
          <Button size="sm" variant="danger" disabled={pending} onClick={() => run(suspendTenant)}>
            স্থগিত
          </Button>
        )}
      </div>
      {error && <span className="text-2xs text-danger">{error}</span>}
    </div>
  );
}
