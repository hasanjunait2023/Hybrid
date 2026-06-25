"use client";

// Create-return form (from an order). Lists the order's items with a select
// checkbox + quantity + restock toggle, plus a type / reason / note. On submit
// it assembles the structured input and posts to createReturnAction.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import type { ReturnType, ReturnReason } from "@/lib/admin/returns";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
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

const TYPE_VALUES: ReturnType[] = ["return", "exchange"];

const REASON_VALUES: ReturnReason[] = [
  "size_issue",
  "wrong_item",
  "damaged",
  "not_as_described",
  "customer_refused",
  "other",
];

const DEFAULT_STATE: ItemState = { selected: false, quantity: 1, restock: true };

export function CreateReturnForm({ orderId, orderNumber, items }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const d = useDict();
  const t = d.admin.returns;
  const tc = t.create;
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
      setError(tc.selectAtLeastOne);
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
        setError(typeof res.error === "string" ? res.error : tc.createFailed);
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
          {tc.selectItems} — {tc.fromOrderPrefix} #{orderNumber}
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
                      {formatMoney(it.unitPrice, locale)} · {tc.max} {formatNumber(it.maxQuantity, locale)}
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{tc.qty}</span>
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
                  <span className="text-xs text-ink-muted">{tc.restock}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{tc.type}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ReturnType)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {value === "return" ? tc.typeReturn : tc.typeExchange}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{tc.reason}</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReturnReason)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {REASON_VALUES.map((value) => (
              <option key={value} value={value}>{t.reason[value]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{tc.noteOptional}</span>
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
          {pending ? tc.waiting : tc.submit}
        </Button>
        <a href={`/admin/orders/${orderId}`} className="text-sm font-medium text-ink-muted hover:text-primary">
          {tc.cancel}
        </a>
      </div>
    </form>
  );
}
