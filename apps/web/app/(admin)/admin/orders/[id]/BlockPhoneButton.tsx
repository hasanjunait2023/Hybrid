"use client";

// Block / unblock this order's phone from the risk panel. Reuses the blocklist
// server actions; refreshes the route so the panel re-reads the signal.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { blockPhoneAction, unblockPhoneAction } from "../../customers/blacklist/actions";

export function BlockPhoneButton({ phone, blocked }: { phone: string; blocked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const res = blocked
        ? await unblockPhoneAction(phone)
        : await blockPhoneAction(phone, "অর্ডার পেজ থেকে ব্লক");
      if (!res.ok) setError(res.error ?? "ব্যর্থ");
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
        {pending ? "…" : blocked ? "আনব্লক" : "নম্বর ব্লক করুন"}
      </button>
    </span>
  );
}
