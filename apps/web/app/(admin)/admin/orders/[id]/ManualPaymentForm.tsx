"use client";

// Mark a manual bKash/Nagad/cash payment on an order (P1 #4). Full payment or a
// partial advance (deposit now, rest COD). Shown only while the order isn't
// fully paid. Defaults the amount to the remaining COD-due for one-tap full mark.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney } from "@/lib/i18n/format";
import { markManualPayment } from "./payment-actions";

const PROVIDER_VALUES = ["bkash", "nagad", "manual"] as const;

export function ManualPaymentForm({
  orderId,
  codDue,
}: {
  orderId: string;
  codDue: number;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useDict().admin.ordersDetail.manualPayment;
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<string>("bkash");
  const [amount, setAmount] = useState<string>(codDue > 0 ? String(codDue) : "");
  const [trxId, setTrxId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    setDone(null);
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError(t.amountRequired);
      return;
    }
    startTransition(async () => {
      const res = await markManualPayment(orderId, provider, amt, trxId.trim() || undefined);
      if (!res.ok) {
        setError(res.error ?? t.failed);
        return;
      }
      setDone(
        res.paymentStatus === "paid"
          ? t.paidDone
          : `${t.advanceDonePrefix} ${formatMoney(res.codDue ?? 0, locale)}।`,
      );
      setTrxId("");
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h2 className="text-sm font-bold text-ink">{t.heading}</h2>
      <p className="mt-0.5 text-2xs text-ink-subtle">
        {t.subtitle}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{t.methodLabel}</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {PROVIDER_VALUES.map((value) => (
              <option key={value} value={value}>{t.providers[value]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{t.amountLabel}</span>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
            {t.trxLabel}
          </span>
          <input
            value={trxId}
            onChange={(e) => setTrxId(e.target.value)}
            placeholder={t.trxPlaceholder}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
      {done && <p className="mt-2 text-xs font-medium text-success">{done}</p>}

      <div className="mt-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? t.working : t.markPayment}
        </Button>
      </div>
    </section>
  );
}
