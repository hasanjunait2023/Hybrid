"use client";

// Bulk product editor table — checkbox selection + an action bar to set status
// or adjust prices by percent for the selected rows.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { bulkSetStatusAction, bulkAdjustPricesAction } from "./actions";

interface Row {
  id: string;
  title: string;
  status: string;
  price: number;
}

const STATUS_LABEL: Record<string, string> = {
  active: "সক্রিয়",
  draft: "খসড়া",
  archived: "আর্কাইভড",
};

export function BulkProductTable({ products, locale }: { products: Row[]; locale: Locale }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"active" | "draft" | "archived">("active");
  const [percent, setPercent] = useState("10");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ids = useMemo(() => [...selected], [selected]);
  const allChecked = products.length > 0 && selected.size === products.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(products.map((p) => p.id)));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; changed?: number }>) => {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErr(res.error ?? "ব্যর্থ হয়েছে।");
        return;
      }
      setMsg(`${res.changed ?? 0} টি পণ্য আপডেট হয়েছে।`);
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <span className="text-sm font-semibold text-ink">
          {selected.size} টি নির্বাচিত
        </span>

        <div className="flex items-end gap-1.5">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
          >
            <option value="active">সক্রিয়</option>
            <option value="draft">খসড়া</option>
            <option value="archived">আর্কাইভড</option>
          </select>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => run(() => bulkSetStatusAction({ ids, status }))}
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            স্ট্যাটাস সেট
          </button>
        </div>

        <div className="flex items-end gap-1.5">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase text-ink-muted">দাম % পরিবর্তন</span>
            <input
              type="number"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="h-9 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum"
            />
          </label>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => run(() => bulkAdjustPricesAction({ ids, percent }))}
            className="h-9 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink disabled:opacity-40"
          >
            দাম সমন্বয়
          </button>
        </div>

        {pending && <span className="text-xs text-ink-muted">…</span>}
        {msg && <span className="text-xs font-medium text-success">{msg}</span>}
        {err && <span className="text-xs font-medium text-danger">{err}</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="সব" />
              </th>
              <th className="px-3 py-2 font-semibold">পণ্য</th>
              <th className="px-3 py-2 font-semibold">স্ট্যাটাস</th>
              <th className="px-3 py-2 text-right font-semibold">দাম</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-ink-muted">
                  কোনো পণ্য নেই।
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className={selected.has(p.id) ? "bg-primary-weak" : undefined}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={p.title}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-ink">{p.title}</td>
                  <td className="px-3 py-2 text-ink-muted">{STATUS_LABEL[p.status] ?? p.status}</td>
                  <td className="px-3 py-2 text-right font-mono tnum">{formatMoney(p.price, locale)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
