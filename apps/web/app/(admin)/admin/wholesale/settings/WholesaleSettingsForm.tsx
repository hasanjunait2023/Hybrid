"use client";

// Wholesale settings form. Bengali-first labels.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { saveWholesaleSettings } from "./actions";

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function WholesaleSettingsForm({
  initial,
}: {
  initial: {
    taxRate: number;
    paymentTerms: string;
    deliveryDays: number;
    minOrderAmount: number;
  };
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.admin.wholesale.settings.form;

  const [taxRate, setTaxRate] = useState(initial.taxRate);
  const [paymentTerms, setPaymentTerms] = useState(initial.paymentTerms);
  const [deliveryDays, setDeliveryDays] = useState(initial.deliveryDays);
  const [minOrderAmount, setMinOrderAmount] = useState(initial.minOrderAmount);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("taxRate", String(taxRate));
    fd.set("paymentTerms", paymentTerms);
    fd.set("deliveryDays", String(deliveryDays));
    fd.set("minOrderAmount", String(minOrderAmount));

    startTransition(async () => {
      const result = await saveWholesaleSettings(null, fd);
      if (result && !result.ok) setError(result.error ?? "Failed to save.");
      else if (result?.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const paymentTermsOptions = d.admin.wholesale.settings.paymentTermsOptions;

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <label htmlFor="taxRate" className="mb-1 block text-sm font-semibold text-ink">{t.taxRate}</label>
        <input
          id="taxRate"
          type="number"
          inputMode="decimal"
          value={taxRate}
          onChange={(e) => setTaxRate(Number(e.target.value))}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="paymentTerms" className="mb-1 block text-sm font-semibold text-ink">{t.paymentTerms}</label>
        <select
          id="paymentTerms"
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
          className={inputCls}
        >
          <option value="due_on_delivery">{paymentTermsOptions.due_on_delivery}</option>
          <option value="net_7">{paymentTermsOptions.net_7}</option>
          <option value="net_15">{paymentTermsOptions.net_15}</option>
          <option value="net_30">{paymentTermsOptions.net_30}</option>
          <option value="prepaid">{paymentTermsOptions.prepaid}</option>
        </select>
      </div>

      <div>
        <label htmlFor="deliveryDays" className="mb-1 block text-sm font-semibold text-ink">{t.deliveryDays}</label>
        <input
          id="deliveryDays"
          type="number"
          inputMode="numeric"
          value={deliveryDays}
          onChange={(e) => setDeliveryDays(Number(e.target.value))}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="minOrderAmount" className="mb-1 block text-sm font-semibold text-ink">{t.minOrderAmount}</label>
        <input
          id="minOrderAmount"
          type="number"
          inputMode="decimal"
          value={minOrderAmount}
          onChange={(e) => setMinOrderAmount(Number(e.target.value))}
          className={inputCls}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">{error}</p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
          {d.admin.wholesale.settings.saved}
        </p>
      )}

      <Button onClick={submit} disabled={pending}>
        {pending ? d.admin.wholesale.settings.saving : t.save}
      </Button>
    </div>
  );
}
