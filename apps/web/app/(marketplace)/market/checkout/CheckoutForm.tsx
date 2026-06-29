"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import type { BuyerAddress } from "@/lib/marketplace/addresses";
import { useMpCart } from "../cart/useMpCart";
import { submitMarketplaceCheckout, type CheckoutResult } from "./actions";

interface Props {
  savedAddresses: BuyerAddress[];
}

export function CheckoutForm({ savedAddresses }: Props) {
  const cart = useMpCart();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    division: "",
    district: "",
    thana: "",
    line: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CheckoutResult | null>(null);
  // Stable per checkout session — prevents duplicate orders on double-tap.
  const [idemKey] = useState(() => crypto.randomUUID());

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const applyAddress = (a: BuyerAddress) => {
    setForm({
      name: a.recipientName,
      phone: a.phone,
      division: a.division,
      district: a.district,
      thana: a.thana,
      line: a.addressLine,
    });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await submitMarketplaceCheckout({
      contact: { name: form.name, phone: form.phone },
      shipTo: {
        division: form.division,
        district: form.district,
        thana: form.thana,
        line: form.line,
      },
      lines: cart.lines.map((l) => ({
        tenantId: l.tenantId,
        variantId: l.variantId,
        quantity: l.quantity,
      })),
      idempotencyKey: idemKey,
      paymentMethod,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.needsLogin) {
        router.push("/login?next=/checkout");
        return;
      }
      setError(res.error);
      return;
    }
    cart.clear();
    setDone(res);
  };

  if (done && done.ok) {
    return (
      <div className="flex flex-col gap-3 py-8 text-center">
        <p className="text-xl font-bold text-cod">অর্ডার নিশ্চিত হয়েছে! ✓</p>
        <p className="text-sm text-ink-muted">
          {done.result.confirmed.length} টি দোকানে আপনার অর্ডার গেছে
          {paymentMethod === "cod" ? " (ক্যাশ অন ডেলিভারি)" : " (অনলাইন পেমেন্ট)"}।
        </p>
        {done.result.failed.length > 0 ? (
          <p className="text-sm text-danger">
            {done.result.failed.length} টি পণ্য স্টকে না থাকায় বাদ পড়েছে।
          </p>
        ) : null}
        <Link href="/account/orders" className="mt-2 text-primary">
          আমার অর্ডার দেখুন
        </Link>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <p className="py-12 text-center text-ink-muted">
        কার্ট খালি।{" "}
        <Link href="/" className="text-primary">
          কেনাকাটা করুন
        </Link>
      </p>
    );
  }

  const fields: [keyof typeof form, string][] = [
    ["name", "নাম"],
    ["phone", "মোবাইল নম্বর"],
    ["division", "বিভাগ"],
    ["district", "জেলা"],
    ["thana", "থানা/উপজেলা"],
    ["line", "সম্পূর্ণ ঠিকানা"],
  ];

  return (
    <div className="flex max-w-md flex-col gap-3">
      {/* Saved address picker */}
      {savedAddresses.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium text-ink-muted">সংরক্ষিত ঠিকানা</p>
          <div className="flex flex-col gap-1">
            {savedAddresses.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => applyAddress(a)}
                className="flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="shrink-0 text-base">📍</span>
                <span className="flex-1 truncate">
                  {a.recipientName} — {a.addressLine}, {a.district}
                  {a.isDefault ? (
                    <span className="ml-1 text-xs text-primary">(ডিফল্ট)</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <Link href="/account/addresses" className="text-xs text-primary hover:underline">
            ঠিকানা পরিচালনা করুন →
          </Link>
        </div>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {fields.map(([k, label]) => (
        <input
          key={k}
          type={k === "phone" ? "tel" : "text"}
          placeholder={label}
          value={form[k]}
          onChange={set(k)}
          className="rounded-md border border-border bg-surface px-3 py-2"
        />
      ))}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="text-sm font-medium text-ink">পেমেন্ট পদ্ধতি</p>
        <div className="flex gap-3">
          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="paymentMethod"
              value="cod"
              checked={paymentMethod === "cod"}
              onChange={() => setPaymentMethod("cod")}
              className="accent-primary"
            />
            <span>ক্যাশ অন ডেলিভারি</span>
          </label>
          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="paymentMethod"
              value="online"
              checked={paymentMethod === "online"}
              onChange={() => setPaymentMethod("online")}
              className="accent-primary"
            />
            <span>অনলাইন পেমেন্ট</span>
          </label>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm">
            মোট: <strong>{formatBdtBangla(cart.subtotal)}</strong> + ডেলিভারি
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="min-h-[44px] rounded-md bg-primary px-6 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {paymentMethod === "cod" ? "অর্ডার নিশ্চিত করুন (COD)" : "অনলাইনে পেমেন্ট করুন"}
          </button>
        </div>
      </div>
    </div>
  );
}
