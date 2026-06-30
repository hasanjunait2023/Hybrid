import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { StatusBadge, StatusStepper, PhoneIcon, ChatIcon } from "@hybrid/ui";
import { getActiveTenantId } from "@/lib/admin/data";
import { getOrderDetail, nextAction } from "@/lib/admin/orders";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { OrderStatusActions } from "./OrderStatusActions";
import { SendToCourierButton } from "./SendToCourierButton";
import { OrderRiskPanel } from "./OrderRiskPanel";
import { ManualPaymentForm } from "./ManualPaymentForm";
import { ManualRefundForm } from "./ManualRefundForm";
import { RefundHistory, fetchRefundHistory } from "./RefundHistory";
import { CustomerHistorySidebar } from "./CustomerHistorySidebar";
import { OrderNotesPanelWrapper } from "./OrderNotesPanelWrapper";
import { Breadcrumbs } from "../../_ui";
import { SlaBadges, type SlaBadgesProps } from "./SlaBadges";

// Order detail (DESIGN §P3.3). Header = order# + stepper + contextual action.
// Two-column ≥ lg, stacked on mobile. Latin numerals, mono amounts (§4.4).
interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const order = await getOrderDetail(tenantId, session.userId, id);
  if (!order) notFound();

  const action = nextAction(order.fulfillmentStatus);
  const addr = order.shippingAddress;

  const { locale, d } = await getDict();
  const t = d.admin.ordersDetail;

  // O22 — refund history + remaining balance for the manual refund button.
  // Compute remaining on the server to keep the client island dumb.
  const [refunds, refundedTotalRow] = await Promise.all([
    fetchRefundHistory(tenantId, session.userId, order.id),
    // Sum already-refunded amounts (excluding pending/cancelled) via withTenant
    // for an accurate "remaining refundable" calculation.
    (async () => {
      const { withTenant } = await import("@hybrid/db");
      const rows = await withTenant(tenantId, session.userId, (tx) =>
        tx<{ total: string }[]>`
          select coalesce(sum(refund_amount), 0) as total
            from return_request
           where order_id = ${order.id}
             and status in ('refunded', 'approved', 'completed')
             and type = 'manual_refund'
        `,
      );
      return Number(rows[0]?.total ?? 0);
    })(),
  ]);
  const remainingRefundable = order.grandTotal - refundedTotalRow;
  const showRefundButton = ["paid", "partially_paid", "partially_refunded"].includes(
    order.paymentStatus,
  );

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: d.admin.nav.orders, href: "/admin/orders" },
          { label: `#${order.orderNumber}` },
        ]}
      />
      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-bold text-ink tnum">#{order.orderNumber}</h1>
            <p className="mt-1 text-xs text-ink-muted">
              {order.source === "manual" ? t.source.manual : t.source.storefront} ·{" "}
              {formatDate(order.placedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge kind="fulfillment" value={order.fulfillmentStatus} lang={locale} />
            <StatusBadge kind="payment" value={order.paymentStatus} lang={locale} />
            {order.codAmount > 0 && order.paymentStatus === "unpaid" && (
              <StatusBadge kind="cod" value={order.shipment?.codStatus ?? "pending"} lang={locale} />
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <StatusStepper status={order.fulfillmentStatus} />
        </div>

        {/* BD Digital Commerce Guidelines 2021 SLA — handover + delivery status */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="text-xs font-semibold text-ink-muted">SLA:</span>
          <SlaBadges
            deadlines={order.sla}
            fulfillmentStatus={order.fulfillmentStatus as SlaBadgesProps["fulfillmentStatus"]}
            deliveredAt={null}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <OrderStatusActions
            orderId={order.id}
            status={order.fulfillmentStatus}
            nextTo={action?.to ?? null}
          />
          <div className="ml-auto flex flex-wrap gap-2">
            {showRefundButton && (
              <ManualRefundForm
                orderId={order.id}
                remainingAmount={remainingRefundable}
                locale={locale}
                formatAmount={formatMoney}
              />
            )}
            <a
              href={`/admin/orders/${order.id}/print?doc=invoice`}
              target="_blank"
              className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              {t.invoice}
            </a>
            <a
              href={`/admin/orders/${order.id}/print?doc=packing`}
              target="_blank"
              className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              {t.packingSlip}
            </a>
          </div>
        </div>
      </div>

      {/* COD-fraud / phone-risk signals (P1 #2) */}
      <OrderRiskPanel tenantId={tenantId} userId={session.userId} orderId={order.id} />

      {/* Manual payment / partial advance (P1 #4) — until fully paid */}
      {order.paymentStatus !== "paid" && (
        <ManualPaymentForm orderId={order.id} codDue={order.codAmount} />
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="space-y-5">
          {/* Items */}
          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">{t.items.heading}</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{it.title}</div>
                      {it.variantTitle && (
                        <div className="text-xs text-ink-muted">{it.variantTitle}</div>
                      )}
                      {it.sku && (
                        <div className="font-mono text-2xs text-ink-subtle">{it.sku}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted tnum">
                      {formatMoney(it.unitPrice, locale)} × {it.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink tnum">
                      {formatMoney(it.lineTotal, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1.5 border-t border-border px-4 py-3 text-sm">
              <Row label={t.items.subtotal} value={formatMoney(order.subtotal, locale)} />
              <Row label={t.items.deliveryCharge} value={formatMoney(order.shippingTotal, locale)} />
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="font-bold text-ink">{t.items.grandTotal}</dt>
                <dd className="font-mono text-lg font-bold text-ink tnum">
                  {formatMoney(order.grandTotal, locale)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Payment */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.payment.heading}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {order.payment && <StatusBadge kind="method" value={order.payment.provider} lang={locale} />}
              <StatusBadge kind="payment" value={order.paymentStatus} lang={locale} />
              {order.codAmount > 0 && (
                <span className="font-mono text-sm font-semibold text-cod tnum">
                  COD: {formatMoney(order.codAmount, locale)}
                </span>
              )}
            </div>
            {order.payment?.transactionId && (
              <p className="mt-2 font-mono text-xs text-ink-muted">
                {t.payment.transactionPrefix} {order.payment.transactionId}
              </p>
            )}
          </section>

          {/* Courier */}
          {(order.shipment ||
            order.fulfillmentStatus === "confirmed" ||
            order.fulfillmentStatus === "packed") && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">{t.courier.heading}</h2>
              {order.shipment ? (
                <dl className="space-y-1 text-sm">
                  <Row label={t.courier.provider} value={order.shipment.provider} mono />
                  {order.shipment.consignmentId && (
                    <Row label={t.courier.consignment} value={order.shipment.consignmentId} mono />
                  )}
                  {order.shipment.trackingCode && (
                    <Row label={t.courier.tracking} value={order.shipment.trackingCode} mono />
                  )}
                  <Row label={t.courier.status} value={order.shipment.status} mono />
                </dl>
              ) : (
                <SendToCourierButton orderId={order.id} />
              )}
            </section>
          )}

          {/* O22 — Refund history (visible always; empty state when no refunds) */}
          <RefundHistory refunds={refunds} locale={locale} labels={t.refundHistory} />
        </div>

        {/* Aside */}
        <aside className="space-y-5">
          {/* Customer */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.customer.heading}</h2>
            <p className="font-medium text-ink">{order.customerName ?? "—"}</p>
            {order.customerPhone && (
              <div className="mt-2 flex items-center gap-3">
                <a
                  href={`tel:${order.customerPhone}`}
                  className="inline-flex items-center gap-1.5 font-mono text-sm text-primary tnum hover:underline"
                >
                  <PhoneIcon className="h-4 w-4" /> {order.customerPhone}
                </a>
                <a
                  href={`https://m.me/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-subtle hover:text-primary"
                  aria-label={t.customer.messengerAria}
                >
                  <ChatIcon className="h-4 w-4" />
                </a>
              </div>
            )}
            {order.customerId && (
              <a
                href={`/admin/customers/${order.customerId}`}
                className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
              >
                {t.customer.viewDetails}
              </a>
            )}
          </section>

          {/* Shipping address */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.shipping.heading}</h2>
            <address className="space-y-0.5 text-sm not-italic text-ink-muted">
              {addr.recipient && <div className="font-medium text-ink">{addr.recipient}</div>}
              {addr.phone && <div className="font-mono tnum">{addr.phone}</div>}
              {addr.line && <div>{addr.line}</div>}
              <div>
                {[addr.thana, addr.district, addr.division].filter(Boolean).join(", ")}
              </div>
            </address>
          </section>

          {order.note && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-bold text-ink">{t.note.heading}</h2>
              <p className="text-sm text-ink-muted">{order.note}</p>
            </section>
          )}

          {order.customerId && order.customerHistory && (
            <CustomerHistorySidebar
              customerId={order.customerId}
              history={order.customerHistory}
              locale={locale}
            />
          )}

          <OrderNotesPanelWrapper orderId={order.id} locale={locale} />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={mono ? "font-mono text-ink tnum" : "text-ink tnum"}>{value}</dd>
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
