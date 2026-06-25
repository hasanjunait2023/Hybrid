"use client";

// Create-return form (from an order). Lists the order's items with a select
// checkbox + quantity + restock toggle, plus a type / reason / note. On submit
// it assembles the structured input and posts to createReturnAction.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, formatBdtLatin } from "@hybrid/ui";
import type { ReturnType, ReturnReason } from "@/lib/admin/returns";
import { createReturnAction } from "../actions";

interface OrderItem {
  orderItemId: string;
  variantId: string | null;
  title: string;
  unitPrice: number;
  maxQuantity: number;
}

interface Props {
  orderId: string;
  orderNumber: number;
  items: OrderItem[];
}

interface ItemState {
  selected: boolean;
  quantity: number;
  restock: boolean;
}

const TYPES: { value: ReturnType; bn: string }[] = [
  { value: "return", bn: "রিটার্ন" },
  { value: "exchange", bn: "এক্সচেঞ্জ" },
];

const REASONS: { value: ReturnReason; bn: string }[] = [
  { value: "size_issue", bn: "সাইজ সমস্যা" },
  { value: "wrong_item", bn: "ভুল পণ্য" },
  { value: "damaged", bn: "ক্ষতিগ্রস্ত" },
  { value: "not_as_described", bn: "বর্ণনা মেলেনি" },
  { value: "customer_refused", bn: "গ্রাহক প্রত্যাখ্যান" },
  { value: "other", bn: "অন্যান্য" },
];

const DEFAULT_STATE: ItemState = { selected: false, quantity: 1, restock: true };

export function CreateReturnForm({ orderId, orderNumber, items }: Props) {
  const router = useRouter();
  const [itemState, setItemState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(items.map((it) => [it.orderItemId, { ...DEFAULT_STATE }])),
  );
  const [type, setType] = useState<ReturnType>("return");
  const [reason, setReason] = useState<ReturnReason>("size_issue");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const stateFor = (id: string): ItemState => itemState[id] ?? DEFAULT_STATE;
  const update = (id: string, patch: Partial<ItemState>) =>
    setItemState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_STATE), ...patch } }));

  const selectedItems = items.filter((it) => stateFor(it.orderItemId).selected);

  const submit = (formData: FormData) => {
    setError(null);
    if (selectedItems.length === 0) {
      setError("অন্তত একটি পণ্য নির্বাচন করুন।");
      return;
    }
    const note = String(formData.get("note") ?? "").trim() || undefined;
    const payload = {
      orderId,
      type,
      reason,
      note,
      items: selectedItems.map((it) => {
        const st = stateFor(it.orderItemId);
        return {
          orderItemId: it.orderItemId,
          variantId: it.variantId,
          title: it.title,
          quantity: st.quantity,
          restock: st.restock,
        };
      }),
    };
    startTransition(async () => {
      const res = await createReturnAction(payload);
      if (res && "error" in res && res.error) {
        setError(typeof res.error === "string" ? res.error : "তৈরি করা যায়নি।");
        return;
      }
      const id = res && "id" in res ? res.id : undefined;
      router.push(id ? `/admin/returns/${id}` : "/admin/returns");
    });
  };

  return (
    <form action={submit} className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">
          পণ্য নির্বাচন — অর্ডার #{orderNumber}
        </h2>
        <ul className="divide-y divide-border">
          {items.map((it) => {
            const st = stateFor(it.orderItemId);
            return (
              <li key={it.orderItemId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={st.selected}
                    onChange={(e) => update(it.orderItemId, { selected: e.target.checked })}
                    className="h-5 w-5 shrink-0 rounded border-border-strong accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{it.title}</span>
                    <span className="font-mono text-xs text-ink-muted tnum">
                      {formatBdtLatin(it.unitPrice)} · সর্বোচ্চ {it.maxQuantity}
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">Qty</span>
                  <input
                    type="number"
                    min={1}
                    max={it.maxQuantity}
                    value={st.quantity}
                    disabled={!st.selected}
                    onChange={(e) =>
                      update(it.orderItemId, {
                        quantity: Math.max(1, Math.min(it.maxQuantity, Number(e.target.value) || 1)),
                      })
                    }
                    className="h-11 w-16 rounded-md border border-border-strong bg-surface px-2 text-center font-mono text-sm text-ink tnum disabled:opacity-50 focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={st.restock}
                    disabled={!st.selected}
                    onChange={(e) => update(it.orderItemId, { restock: e.target.checked })}
                    className="h-5 w-5 rounded border-border-strong accent-primary disabled:opacity-50"
                  />
                  <span className="text-xs text-ink-muted">রিস্টক</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">ধরন</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ReturnType)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.bn}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">কারণ</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReturnReason)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.bn}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">নোট (ঐচ্ছিক)</span>
          <textarea
            name="note"
            rows={3}
            className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </label>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "অপেক্ষা করুন…" : "রিটার্ন তৈরি করুন"}
        </Button>
        <a href={`/admin/orders/${orderId}`} className="text-sm font-medium text-ink-muted hover:text-primary">
          বাতিল
        </a>
      </div>
    </form>
  );
}
