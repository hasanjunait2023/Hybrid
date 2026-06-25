import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getReturn } from "@/lib/admin/returns";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { ReturnStatusChip, ReturnTypeChip } from "../ReturnStatusChip";
import { ReturnActions } from "./ReturnActions";

// Return detail (mirrors orders/[id] layout). Header = return ref + order link +
// type/status chips. Two-column ≥ lg: items + refund + timeline on the left,
// customer + actions on the right. Latin numerals, mono amounts (§4.4).
interface ReturnDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReturnDetailPage({ params }: ReturnDetailPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const ret = await getReturn(tenantId, session.userId, id);
  if (!ret) notFound();

  const { locale, d } = await getDict();
  const t = d.admin.returns;

  return (
    <div className="space-y-5">
      <a href="/admin/returns" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.backToList}
      </a>

      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">{t.detail.heading}</h1>
              <a
                href={`/admin/orders/${ret.orderId}`}
                className="font-mono text-lg font-semibold text-primary tnum hover:underline"
              >
                #{ret.orderNumber}
              </a>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {formatDate(ret.createdAt)}
              {ret.resolvedAt && <> · {t.detail.resolved} {formatDate(ret.resolvedAt)}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ReturnTypeChip type={ret.type} lang={locale} />
            <ReturnStatusChip status={ret.status} lang={locale} />
            <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
              {t.reason[ret.reason as keyof typeof t.reason] ?? ret.reason}
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
              {t.detail.items} ({formatNumber(ret.itemCount, locale)})
            </h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {ret.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{it.title}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted tnum">
                      × {formatNumber(it.quantity, locale)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                          it.restock
                            ? "bg-success-weak text-success"
                            : "bg-surface-2 text-ink-muted"
                        }`}
                      >
                        {it.restock ? t.detail.restock : t.detail.noRestock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Refund summary */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.detail.refund}</h2>
            <dl className="space-y-1.5 text-sm">
              <Row label={t.detail.orderTotal} value={formatMoney(ret.orderGrandTotal, locale)} mono />
              <Row label={t.detail.method} value={t.method[ret.refundMethod as keyof typeof t.method] ?? ret.refundMethod} />
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="font-bold text-ink">{t.detail.refundAmount}</dt>
                <dd className="font-mono text-lg font-bold text-ink tnum">
                  {formatMoney(ret.refundAmount, locale)}
                </dd>
              </div>
            </dl>
            {ret.reverseShipmentId && (
              <p className="mt-2 font-mono text-xs text-ink-muted">
                {t.detail.reverseShipment}: {ret.reverseShipmentId}
              </p>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              {t.detail.inventoryRestock}: {ret.restocked ? t.detail.restockDone : t.detail.restockNotDone}
            </p>
          </section>

          {ret.note && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-bold text-ink">{t.detail.note}</h2>
              <p className="text-sm text-ink-muted">{ret.note}</p>
            </section>
          )}
        </div>

        {/* Aside */}
        <aside className="space-y-5">
          {/* Actions */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.detail.actions}</h2>
            <ReturnActions
              returnId={ret.id}
              status={ret.status}
              defaultRefundAmount={ret.refundAmount}
            />
          </section>

          {/* Customer */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.detail.customer}</h2>
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
              {t.detail.orderDetail} →
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
