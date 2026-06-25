"use client";

// Plan create/edit (PP1-A4). No `plan` → "new plan" toggle; with `plan` → edit
// that row. Inline form posts to savePlanAction. Empty product/order limit = ∞.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { savePlanAction, togglePlanAction } from "./actions";

interface Plan {
  id: string;
  code: string;
  name: string;
  priceBdt: number;
  billingInterval: string;
  maxProducts: number | null;
  maxOrdersMonth: number | null;
  maxCustomDomains: number;
  maxStaff: number;
  isActive: boolean;
  sortOrder: number;
}

export function PlanEditor({ plan }: { plan?: Plan }) {
  const d = useDict();
  const tx = d.platform.plans;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (fd: FormData) => {
    setError(null);
    const raw = {
      code: String(fd.get("code") ?? ""),
      name: String(fd.get("name") ?? ""),
      priceBdt: fd.get("priceBdt"),
      billingInterval: String(fd.get("billingInterval") ?? "monthly"),
      maxProducts: String(fd.get("maxProducts") ?? ""),
      maxOrdersMonth: String(fd.get("maxOrdersMonth") ?? ""),
      maxCustomDomains: fd.get("maxCustomDomains"),
      maxStaff: fd.get("maxStaff"),
      isActive: fd.get("isActive") === "on",
      sortOrder: fd.get("sortOrder"),
    };
    start(async () => {
      const res = await savePlanAction(plan?.id ?? null, raw);
      if (!res.ok) { setError(res.error ?? d.platform.common.failed); return; }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-border-strong px-2 py-1 text-2xs font-semibold text-ink hover:bg-surface-2">
          {plan ? tx.edit : tx.newPlan}
        </button>
        {plan && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { const r = await togglePlanAction(plan.id, !plan.isActive); if (r.ok) router.refresh(); })}
            className="rounded-md border border-border-strong px-2 py-1 text-2xs font-semibold text-ink-muted hover:bg-surface-2 disabled:opacity-50"
          >
            {plan.isActive ? tx.deactivate : tx.activate}
          </button>
        )}
      </div>
    );
  }

  const v = plan;
  return (
    <form action={save} className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h3 className="text-sm font-bold text-ink">{plan ? tx.editPlan : tx.newPlan}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field name="code" label={tx.fieldCode} defaultValue={v?.code} mono required />
        <Field name="name" label={tx.fieldName} defaultValue={v?.name} required />
        <Field name="priceBdt" label={tx.fieldPrice} type="number" defaultValue={v?.priceBdt} required />
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase text-ink-muted">{tx.fieldBilling}</span>
          <select name="billingInterval" defaultValue={v?.billingInterval ?? "monthly"} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
            <option value="monthly">monthly</option>
            <option value="yearly">yearly</option>
          </select>
        </label>
        <Field name="maxProducts" label={tx.fieldProducts} type="number" defaultValue={v?.maxProducts ?? ""} />
        <Field name="maxOrdersMonth" label={tx.fieldOrdersPerMonth} type="number" defaultValue={v?.maxOrdersMonth ?? ""} />
        <Field name="maxStaff" label={tx.fieldStaff} type="number" defaultValue={v?.maxStaff ?? 1} required />
        <Field name="maxCustomDomains" label={tx.fieldDomains} type="number" defaultValue={v?.maxCustomDomains ?? 0} required />
        <Field name="sortOrder" label={tx.fieldSortOrder} type="number" defaultValue={v?.sortOrder ?? 0} required />
        <label className="flex items-center gap-2 pt-5">
          <input type="checkbox" name="isActive" defaultChecked={v?.isActive ?? true} className="h-4 w-4 accent-primary" />
          <span className="text-sm text-ink">{tx.activeLabel}</span>
        </label>
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "…" : tx.save}</Button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-ink-muted hover:text-primary">{tx.cancel}</button>
      </div>
    </form>
  );
}

function Field({ name, label, defaultValue, type = "text", mono = false, required = false }: {
  name: string; label: string; defaultValue?: string | number; type?: string; mono?: boolean; required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs font-semibold uppercase text-ink-muted">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className={`h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}
