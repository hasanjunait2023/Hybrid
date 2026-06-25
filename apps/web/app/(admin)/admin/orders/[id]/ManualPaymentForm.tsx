"use client";

// Mark a manual bKash/Nagad/cash payment on an order (P1 #4). Full payment or a
// partial advance (deposit now, rest COD). Shown only while the order isn't
// fully paid. Defaults the amount to the remaining COD-due for one-tap full mark.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, formatBdtLatin } from "@hybrid/ui";
import { markManualPayment } from "./payment-actions";

const PROVIDERS = [
  { value: "bkash", bn: "বিকাশ" },
  { value: "nagad", bn: "নগদ" },
  { value: "manual", bn: "ক্যাশ / অন্যান্য" },
] as const;

export function ManualPaymentForm({
  orderId,
  codDue,
}: {
  orderId: string;
  codDue: number;
}) {
  const router = useRouter();
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
      setError("পরিমাণ দিন।");
      return;
    }
    startTransition(async () => {
      const res = await markManualPayment(orderId, provider, amt, trxId.trim() || undefined);
      if (!res.ok) {
        setError(res.error ?? "ব্যর্থ হয়েছে।");
        return;
      }
      setDone(
        res.paymentStatus === "paid"
          ? "সম্পূর্ণ পরিশোধিত হিসেবে চিহ্নিত।"
          : `অ্যাডভান্স রেকর্ড হয়েছে — বাকি COD ${formatBdtLatin(res.codDue ?? 0)}।`,
      );
      setTrxId("");
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h2 className="text-sm font-bold text-ink">পেমেন্ট রেকর্ড করুন</h2>
      <p className="mt-0.5 text-2xs text-ink-subtle">
        বিকাশ/নগদ TrxID যাচাই করে সম্পূর্ণ বা অ্যাডভান্স মার্ক করুন।
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">মাধ্যম</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.bn}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">পরিমাণ</span>
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
            ট্রানজেকশন আইডি (ঐচ্ছিক)
          </span>
          <input
            value={trxId}
            onChange={(e) => setTrxId(e.target.value)}
            placeholder="যেমন: 8N7A3D9L"
            className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
      {done && <p className="mt-2 text-xs font-medium text-success">{done}</p>}

      <div className="mt-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? "…" : "পেমেন্ট মার্ক করুন"}
        </Button>
      </div>
    </section>
  );
}
