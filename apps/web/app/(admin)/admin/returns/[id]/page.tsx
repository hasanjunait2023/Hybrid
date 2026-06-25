import { notFound, redirect } from "next/navigation";
import { formatBdtLatin } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getReturn } from "@/lib/admin/returns";
import { ReturnStatusChip, ReturnTypeChip } from "../ReturnStatusChip";
import { ReturnActions } from "./ReturnActions";

// Return detail (mirrors orders/[id] layout). Header = return ref + order link +
// type/status chips. Two-column ≥ lg: items + refund + timeline on the left,
// customer + actions on the right. Latin numerals, mono amounts (§4.4).
interface ReturnDetailPageProps {
  params: Promise<{ id: string }>;
}

const REASON_BN: Record<string, string> = {
  wrong_item: "ভুল পণ্য",
  damaged: "ক্ষতিগ্রস্ত",
  size_issue: "সাইজ সমস্যা",
  not_as_described: "বর্ণনা মেলেনি",
  customer_refused: "গ্রাহক প্রত্যাখ্যান",
  rto_undelivered: "ডেলিভারি ব্যর্থ",
  fake_order: "ভুয়া অর্ডার",
  other: "অন্যান্য",
};

const METHOD_BN: Record<string, string> = {
  bkash: "বিকাশ",
  nagad: "নগদ",
  cash: "ক্যাশ",
  none: "—",
};

export default async function ReturnDetailPage({ params }: ReturnDetailPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const ret = await getReturn(tenantId, session.userId, id);
  if (!ret) notFound();

  return (
    <div lang="en" className="space-y-5">
      <a href="/admin/returns" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← রিটার্ন তালিকা
      </a>

      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">রিটার্ন</h1>
              <a
                href={`/admin/orders/${ret.orderId}`}
                className="font-mono text-lg font-semibold text-primary tnum hover:underline"
              >
                #{ret.orderNumber}
              </a>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {formatDate(ret.createdAt)}
              {ret.resolvedAt && <> · সমাধান {formatDate(ret.resolvedAt)}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ReturnTypeChip type={ret.type} />
            <ReturnStatusChip status={ret.status} />
            <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
              {REASON_BN[ret.reason] ?? ret.reason}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="space-y-5">
          {/* Items */}
          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">
              পণ্য ({ret.itemCount})
            </h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {ret.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{it.title}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted tnum">
                      × {it.quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                          it.restock
                            ? "bg-success-weak text-success"
                            : "bg-surface-2 text-ink-muted"
                        }`}
                      >
                        {it.restock ? "রিস্টক" : "রিস্টক নয়"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Refund summary */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">রিফান্ড</h2>
            <dl className="space-y-1.5 text-sm">
              <Row label="অর্ডার মোট" value={formatBdtLatin(ret.orderGrandTotal)} mono />
              <Row label="মাধ্যম" value={METHOD_BN[ret.refundMethod] ?? ret.refundMethod} />
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="font-bold text-ink">রিফান্ড পরিমাণ</dt>
                <dd className="font-mono text-lg font-bold text-ink tnum">
                  {formatBdtLatin(ret.refundAmount)}
                </dd>
              </div>
            </dl>
            {ret.reverseShipmentId && (
              <p className="mt-2 font-mono text-xs text-ink-muted">
                রিভার্স শিপমেন্ট: {ret.reverseShipmentId}
              </p>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              ইনভেন্টরি রিস্টক: {ret.restocked ? "হয়েছে" : "হয়নি"}
            </p>
          </section>

          {ret.note && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-bold text-ink">নোট</h2>
              <p className="text-sm text-ink-muted">{ret.note}</p>
            </section>
          )}
        </div>

        {/* Aside */}
        <aside className="space-y-5">
          {/* Actions */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">অ্যাকশন</h2>
            <ReturnActions
              returnId={ret.id}
              status={ret.status}
              defaultRefundAmount={ret.refundAmount}
            />
          </section>

          {/* Customer */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">গ্রাহক</h2>
            <p className="font-medium text-ink">{ret.customerName ?? "—"}</p>
            {ret.customerPhone && (
              <a
                href={`tel:${ret.customerPhone}`}
                className="mt-1 inline-block font-mono text-sm text-primary tnum hover:underline"
              >
                {ret.customerPhone}
              </a>
            )}
            <a
              href={`/admin/orders/${ret.orderId}`}
              className="mt-3 block text-xs font-semibold text-primary hover:underline"
            >
              অর্ডার বিস্তারিত →
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={mono ? "font-mono text-ink tnum" : "text-ink"}>{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
