"use client";

// Discount create/edit form (DESIGN §Q6). Code, type segmented control, value,
// min-cart, usage limits, active window, status. Admin numerals are Latin
// (lang="en" on the wrapper page). Posts saveDiscount; deleteDiscount removes.
import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import { saveDiscount, deleteDiscount } from "./actions";
import type { DiscountType, DiscountStatus } from "@/lib/admin/discounts";

export interface DiscountFormData {
  id?: string;
  code: string;
  title: string;
  type: DiscountType;
  value: string;
  minSubtotal: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  endsAt: string;
  status: DiscountStatus;
}

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

const TYPES: { value: DiscountType; label: string }[] = [
  { value: "percentage", label: "শতকরা (%)" },
  { value: "fixed_amount", label: "নির্দিষ্ট (৳)" },
  { value: "free_shipping", label: "ফ্রি ডেলিভারি" },
];

const STATUSES: { value: DiscountStatus; label: string }[] = [
  { value: "active", label: "সক্রিয়" },
  { value: "scheduled", label: "নির্ধারিত" },
  { value: "disabled", label: "বন্ধ" },
  { value: "expired", label: "মেয়াদোত্তীর্ণ" },
];

export function DiscountForm({ initial }: { initial: DiscountFormData }) {
  const isEdit = Boolean(initial.id);

  const [code, setCode] = useState(initial.code);
  const [title, setTitle] = useState(initial.title);
  const [type, setType] = useState<DiscountType>(initial.type);
  const [value, setValue] = useState(initial.value);
  const [minSubtotal, setMinSubtotal] = useState(initial.minSubtotal);
  const [usageLimit, setUsageLimit] = useState(initial.usageLimit);
  const [perCustomerLimit, setPerCustomerLimit] = useState(initial.perCustomerLimit);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [endsAt, setEndsAt] = useState(initial.endsAt);
  const [status, setStatus] = useState<DiscountStatus>(initial.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isFreeShipping = type === "free_shipping";

  function submit() {
    setError(null);
    const fd = new FormData();
    if (initial.id) fd.set("id", initial.id);
    fd.set("code", code.trim());
    fd.set("title", title);
    fd.set("type", type);
    fd.set("value", isFreeShipping ? "0" : value);
    fd.set("minSubtotal", minSubtotal || "0");
    fd.set("usageLimit", usageLimit);
    fd.set("perCustomerLimit", perCustomerLimit);
    fd.set("startsAt", startsAt);
    fd.set("endsAt", endsAt);
    fd.set("status", status);
    startTransition(async () => {
      const result = await saveDiscount(null, fd);
      // On success the action redirects; a returned envelope means an error.
      if (result && !result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
    });
  }

  function onDelete() {
    if (!initial.id) return;
    const fd = new FormData();
    fd.set("id", initial.id);
    startTransition(() => {
      void deleteDiscount(null, fd);
    });
  }

  return (
    <div className="max-w-xl space-y-5">
      <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-semibold text-ink">কোড</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="EID25"
            autoCapitalize="characters"
            className={`${inputCls} font-mono uppercase`}
          />
        </div>
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-semibold text-ink">শিরোনাম (ঐচ্ছিক)</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink">ধরন</span>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border-strong bg-surface-2 p-1">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                aria-pressed={type === t.value}
                className={`min-h-11 rounded-sm px-2 text-sm font-medium transition-colors ${
                  type === t.value
                    ? "bg-primary text-ink-on-primary shadow-xs"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {!isFreeShipping && (
          <div>
            <label htmlFor="value" className="mb-1 block text-sm font-semibold text-ink">
              {type === "percentage" ? "শতকরা মান (%)" : "ছাড়ের পরিমাণ (৳)"}
            </label>
            <input
              id="value"
              type="number"
              inputMode="decimal"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label htmlFor="minSubtotal" className="mb-1 block text-sm font-semibold text-ink">
            ন্যূনতম কার্ট মূল্য (৳)
          </label>
          <input
            id="minSubtotal"
            type="number"
            inputMode="decimal"
            min={0}
            value={minSubtotal}
            onChange={(e) => setMinSubtotal(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="usageLimit" className="mb-1 block text-sm font-semibold text-ink">
              মোট ব্যবহার সীমা
            </label>
            <input
              id="usageLimit"
              type="number"
              inputMode="numeric"
              min={1}
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              placeholder="সীমাহীন"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="perCustomerLimit" className="mb-1 block text-sm font-semibold text-ink">
              প্রতি গ্রাহক সীমা
            </label>
            <input
              id="perCustomerLimit"
              type="number"
              inputMode="numeric"
              min={1}
              value={perCustomerLimit}
              onChange={(e) => setPerCustomerLimit(e.target.value)}
              placeholder="সীমাহীন"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="startsAt" className="mb-1 block text-sm font-semibold text-ink">শুরু</label>
            <input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="endsAt" className="mb-1 block text-sm font-semibold text-ink">শেষ</label>
            <input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-semibold text-ink">অবস্থা</label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as DiscountStatus)}
            className={inputCls}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "সেভ হচ্ছে…" : isEdit ? "সেভ করুন" : "ডিসকাউন্ট তৈরি করুন"}
        </Button>
        {isEdit && (
          <Button onClick={onDelete} variant="secondary" disabled={pending} className="text-danger">
            মুছুন
          </Button>
        )}
      </div>
    </div>
  );
}
