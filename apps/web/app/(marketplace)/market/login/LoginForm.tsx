"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestBuyerOtp, verifyBuyerOtp } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account/orders";

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const r = await requestBuyerOtp(phone);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "ত্রুটি");
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const r = await verifyBuyerOtp(phone, code, name);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "ত্রুটি");
    router.push(next);
    router.refresh();
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-3">
      <h1 className="text-lg font-semibold">লগইন / রেজিস্টার</h1>
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {step === "phone" ? (
        <>
          <input
            type="tel"
            inputMode="tel"
            placeholder="মোবাইল নম্বর"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
          <input
            type="text"
            placeholder="আপনার নাম (ঐচ্ছিক)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={busy}
            className="min-h-[44px] rounded-md bg-primary font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            কোড পাঠান
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">{phone} এ পাঠানো কোড দিন</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="৬ সংখ্যার কোড"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 tracking-widest"
          />
          <button
            type="button"
            onClick={verify}
            disabled={busy}
            className="min-h-[44px] rounded-md bg-primary font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            যাচাই করুন
          </button>
          <button type="button" onClick={() => setStep("phone")} className="text-sm text-ink-muted">
            নম্বর পরিবর্তন করুন
          </button>
        </>
      )}
    </div>
  );
}
