"use client";

// Desktop orders table with row selection + a sticky bulk-action bar (tenant
// roadmap P1 #3). The daily batch: tick the morning's new orders, confirm them
// all, then push them all to the courier. Partial results are surfaced (e.g.
// "18 done, 2 skipped"). Mobile keeps the simple stacked cards (no bulk).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBdtLatin, StatusBadge } from "@hybrid/ui";
import { timeAgoBn } from "@/lib/admin/format";
import type { OrderListRow } from "@/lib/admin/orders";
import { bulkAdvanceStatus, bulkSendToCourier } from "./bulk-actions";

export function OrdersBulkTable({ orders }: { orders: OrderListRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const allIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const allSelected = selected.size > 0 && selected.size === orders.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((s) => (s.size === orders.length ? new Set() : new Set(allIds)));

  const run = (fn: () => Promise<{ ok: boolean; succeeded: number; failed: { id: string }[]; error?: string }>, label: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage(res.error ?? "ব্যর্থ হয়েছে।");
        return;
      }
      const skipped = res.failed.length;
      setMessage(
        `${label}: ${res.succeeded} টি সম্পন্ন${skipped ? ` · ${skipped} টি বাদ` : ""}।`,
      );
      setSelected(new Set());
      router.refresh();
    });
  };

  const ids = () => [...selected];

  return (
    <div className="hidden md:block">
      {selected.size > 0 && (
        <div className="sticky top-14 z-sticky mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-primary-weak px-4 py-2.5">
          <span className="text-sm font-semibold text-primary">{selected.size} টি নির্বাচিত</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <BulkBtn disabled={pending} onClick={() => run(() => bulkAdvanceStatus(ids(), "confirmed"), "নিশ্চিত")}>
              নিশ্চিত করুন
            </BulkBtn>
            <BulkBtn disabled={pending} onClick={() => run(() => bulkAdvanceStatus(ids(), "packed"), "প্যাক")}>
              প্যাক করুন
            </BulkBtn>
            <BulkBtn disabled={pending} primary onClick={() => run(() => bulkSendToCourier(ids()), "কুরিয়ার")}>
              কুরিয়ারে পাঠান
            </BulkBtn>
          </div>
        </div>
      )}

      {message && (
        <p className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-sm font-medium text-ink">{message}</p>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="সব নির্বাচন"
                  className="h-4 w-4 rounded border-border-strong accent-primary"
                />
              </th>
              <th className="px-3 py-2.5 font-semibold">Order#</th>
              <th className="px-3 py-2.5 font-semibold">গ্রাহক</th>
              <th className="px-3 py-2.5 text-right font-semibold">মোট</th>
              <th className="px-3 py-2.5 font-semibold">ফুলফিলমেন্ট</th>
              <th className="px-3 py-2.5 font-semibold">পেমেন্ট</th>
              <th className="px-3 py-2.5 font-semibold">তারিখ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const isSel = selected.has(o.id);
              return (
                <tr key={o.id} className={isSel ? "bg-primary-weak" : i % 2 === 1 ? "bg-surface-2" : undefined}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(o.id)}
                      aria-label={`অর্ডার ${o.orderNumber} নির্বাচন`}
                      className="h-4 w-4 rounded border-border-strong accent-primary"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <a href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-ink hover:text-primary hover:underline tnum">
                      #{o.orderNumber}
                    </a>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-ink">{o.customerName ?? "—"}</div>
                    <div className="font-mono text-xs text-ink-muted tnum">{o.customerPhone}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink tnum">
                    {formatBdtLatin(o.grandTotal)}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge kind="fulfillment" value={o.fulfillmentStatus} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge kind="payment" value={o.paymentStatus} />
                      {o.codAmount > 0 && o.paymentStatus === "unpaid" && (
                        <StatusBadge kind="cod" value="pending" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-muted">{timeAgoBn(o.placedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BulkBtn({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold disabled:opacity-50 ${
        primary
          ? "bg-primary text-ink-on-primary hover:bg-primary-hover"
          : "border border-border-strong bg-surface text-ink hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
