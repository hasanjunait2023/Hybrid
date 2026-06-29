"use client";
// Self-serve plan upgrade button. Shows a phone input (bKash payer reference)
// and kicks off the bKash payment flow when submitted.
import { useState } from "react";
import { initiateUpgradeAction } from "./actions";

interface UpgradePlanButtonProps {
  planId: string;
  planName: string;
  priceBdt: number;
  defaultPhone: string | null;
}

export function UpgradePlanButton({ planId, planName, priceBdt, defaultPhone }: UpgradePlanButtonProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    if (!phone.trim()) {
      setError("বিকাশ নম্বর দিন।");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await initiateUpgradeAction({ planId, tenantPhone: phone.trim() });
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // Redirect to bKash hosted page.
    window.location.href = result.bkashURL;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        আপগ্রেড করুন
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs text-ink-muted">
        বিকাশ পেমেন্টে ৳{priceBdt.toLocaleString("bn-BD")} পরিশোধ করুন <strong>({planName})</strong>
      </p>
      <div className="flex gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="আপনার বিকাশ নম্বর"
          className="flex-1 rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          disabled={loading}
        />
        <button
          type="button"
          onClick={handleUpgrade}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {loading ? "অপেক্ষা করুন..." : "পেমেন্ট করুন"}
        </button>
        {!loading && (
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            className="rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:bg-surface-2"
          >
            বাতিল
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
