"use client";

// Loyalty points balance + staff redeem (CRM R1.6). The seller enters points to
// redeem for an in-person/manual sale; the server validates the live balance and
// returns the taka value applied.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Messages } from "@/lib/i18n/dictionaries";
import { redeemPointsAction } from "../actions";

type T = Messages["admin"]["customers"]["detail"];

export function RedeemPoints({
  customerId,
  balance,
  t,
}: {
  customerId: string;
  balance: number;
  t: T;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [points, setPoints] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const n = Number(points);
    if (!Number.isInteger(n) || n <= 0) return;
    setMsg(null);
    setError(null);
    start(async () => {
      const res = await redeemPointsAction(customerId, n);
      if (!res.ok) {
        setError(res.error ?? null);
        return;
      }
      setMsg(`${t.redeemDone}${res.takaValue ?? 0}`);
      setPoints("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-md bg-success-weak px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-success">{t.loyaltyLabel}</span>
        <span className="font-mono text-sm font-bold text-success tnum">
          {balance} {t.pointsUnit}
        </span>
      </div>
      {balance > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={balance}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={t.redeemPlaceholder}
            className="h-8 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum"
          />
          <button
            type="button"
            disabled={pending || !points}
            onClick={submit}
            className="h-8 rounded-md bg-success px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? t.redeeming : t.redeem}
          </button>
        </div>
      )}
      {msg && <p className="mt-1 text-2xs font-medium text-success">{msg}</p>}
      {error && <p className="mt-1 text-2xs font-medium text-danger">{error}</p>}
    </div>
  );
}
