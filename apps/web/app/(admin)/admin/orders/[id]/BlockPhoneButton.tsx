"use client";

// Block / unblock this order's phone from the risk panel. Reuses the blocklist
// server actions; refreshes the route so the panel re-reads the signal.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDict } from "@/lib/i18n/provider";
import { blockPhoneAction, unblockPhoneAction } from "../../customers/blacklist/actions";

export function BlockPhoneButton({ phone, blocked }: { phone: string; blocked: boolean }) {
  const router = useRouter();
  const t = useDict().admin.ordersDetail.blockPhone;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const res = blocked
        ? await unblockPhoneAction(phone)
        : await blockPhoneAction(phone, t.reason);
      if (!res.ok) setError(res.error ?? t.failed);
      else router.refresh();
    });
  };

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-2xs text-danger">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          blocked
            ? "border border-border-strong text-ink hover:bg-surface-2"
            : "bg-danger text-ink-on-primary hover:opacity-90"
        }`}
      >
        {pending ? t.working : blocked ? t.unblock : t.block}
      </button>
    </span>
  );
}
