"use client";

// B2B customer inline edit form. Bengali-first labels.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { saveB2BCustomer } from "./actions";

export interface B2BCustomerFormData {
  customerId: string;
  businessName: string;
  customerType: string;
  tradeLicenseNo: string;
  binNo: string;
  creditLimit: number;
  isVerified: boolean;
}

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function WholesaleCustomerForm({
  initial,
  onClose,
}: {
  initial: B2BCustomerFormData;
  onClose: () => void;
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.admin.wholesale.customers.form;

  const [businessName, setBusinessName] = useState(initial.businessName);
  const [customerType, setCustomerType] = useState(initial.customerType);
  const [tradeLicenseNo, setTradeLicenseNo] = useState(initial.tradeLicenseNo);
  const [binNo, setBinNo] = useState(initial.binNo);
  const [creditLimit, setCreditLimit] = useState(initial.creditLimit);
  const [isVerified, setIsVerified] = useState(initial.isVerified);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("customerId", initial.customerId);
    fd.set("businessName", businessName);
    fd.set("customerType", customerType);
    fd.set("tradeLicenseNo", tradeLicenseNo);
    fd.set("binNo", binNo);
    fd.set("creditLimit", String(creditLimit));
    fd.set("isVerified", isVerified ? "on" : "");

    startTransition(async () => {
      const result = await saveB2BCustomer(null, fd);
      if (result && !result.ok) setError(result.error ?? t.saveFailed);
      else if (result?.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(onClose, 800);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <label htmlFor="businessName" className="mb-1 block text-sm font-semibold text-ink">{t.businessName}</label>
        <input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputCls} />
      </div>

      <div>
        <label htmlFor="customerType" className="mb-1 block text-sm font-semibold text-ink">{t.customerType}</label>
        <select
          id="customerType"
          value={customerType}
          onChange={(e) => setCustomerType(e.target.value)}
          className={inputCls}
        >
          <option value="retailer">{d.admin.wholesale.customers.types.retailer}</option>
          <option value="distributor">{d.admin.wholesale.customers.types.distributor}</option>
          <option value="wholesaler">{d.admin.wholesale.customers.types.wholesaler}</option>
        </select>
      </div>

      <div>
        <label htmlFor="tradeLicenseNo" className="mb-1 block text-sm font-semibold text-ink">{t.tradeLicense}</label>
        <input id="tradeLicenseNo" value={tradeLicenseNo} onChange={(e) => setTradeLicenseNo(e.target.value)} className={inputCls} />
      </div>

      <div>
        <label htmlFor="binNo" className="mb-1 block text-sm font-semibold text-ink">{t.binNo}</label>
        <input id="binNo" value={binNo} onChange={(e) => setBinNo(e.target.value)} className={inputCls} />
      </div>

      <div>
        <label htmlFor="creditLimit" className="mb-1 block text-sm font-semibold text-ink">{t.creditLimit}</label>
        <input
          id="creditLimit"
          type="number"
          inputMode="decimal"
          value={creditLimit}
          onChange={(e) => setCreditLimit(Number(e.target.value))}
          className={inputCls}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={isVerified}
          onChange={(e) => setIsVerified(e.target.checked)}
          className="h-4 w-4"
        />
        {t.isVerified}
      </label>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">{error}</p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">{t.saved}</p>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        <Button onClick={onClose} variant="secondary">
          বন্ধ করুন
        </Button>
      </div>
    </div>
  );
}
