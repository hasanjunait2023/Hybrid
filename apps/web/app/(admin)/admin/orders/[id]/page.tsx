import { notFound, redirect } from "next/navigation";
import { formatBdtLatin, StatusBadge, StatusStepper, PhoneIcon, ChatIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getOrderDetail, nextAction } from "@/lib/admin/orders";
import { OrderStatusActions } from "./OrderStatusActions";
import { SendToCourierButton } from "./SendToCourierButton";

// Order detail (DESIGN §P3.3). Header = order# + stepper + contextual action.
// Two-column ≥ lg, stacked on mobile. Latin numerals, mono amounts (§4.4).
interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const order = await getOrderDetail(tenantId, session.userId, id);
  if (!order) notFound();

  const action = nextAction(order.fulfillmentStatus);
  const addr = order.shippingAddress;

  return (
    <div lang="en" className="space-y-5">
      <a href="/admin/orders" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← অর্ডার তালিকা
      </a>

      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-bold text-ink tnum">#{order.orderNumber}</h1>
            <p className="mt-1 text-xs text-ink-muted">
              {order.source === "manual" ? "ম্যানুয়াল" : "স্টোরফ্রন্ট"} ·{" "}
              {formatDate(order.placedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge kind="fulfillment" value={order.fulfillmentStatus} />
            <StatusBadge kind="payment" value={order.paymentStatus} />
            {order.codAmount > 0 && order.paymentStatus === "unpaid" && (
              <StatusBadge kind="cod" value={order.shipment?.codStatus ?? "pending"} />
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <StatusStepper status={order.fulfillmentStatus} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <OrderStatusActions
            orderId={order.id}
            status={order.fulfillmentStatus}
            nextTo={action?.to ?? null}
            nextLabel={action?.bn ?? null}
          />
          <div className="ml-auto flex gap-2">
            <a
              href={`/admin/orders/${order.id}/print?doc=invoice`}
              target="_blank"
              className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              ইনভয়েস
            </a>
            <a
              href={`/admin/orders/${order.id}/print?doc=packing`}
              target="_blank"
              className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              প্যাকিং স্লিপ
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="space-y-5">
          {/* Items */}
          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">পণ্য</h2>
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
                      {formatBdtLatin(it.unitPrice)} × {it.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink tnum">
                      {formatBdtLatin(it.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1.5 border-t border-border px-4 py-3 text-sm">
              <Row label="সাবটোটাল" value={formatBdtLatin(order.subtotal)} />
              <Row label="ডেলিভারি চার্জ" value={formatBdtLatin(order.shippingTotal)} />
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="font-bold text-ink">সর্বমোট</dt>
                <dd className="font-mono text-lg font-bold text-ink tnum">
                  {formatBdtLatin(order.grandTotal)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Payment */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">পেমেন্ট</h2>
            <div className="flex flex-wrap items-center gap-2">
              {order.payment && <StatusBadge kind="method" value={order.payment.provider} />}
              <StatusBadge kind="payment" value={order.paymentStatus} />
              {order.codAmount > 0 && (
                <span className="font-mono text-sm font-semibold text-cod tnum">
                  COD: {formatBdtLatin(order.codAmount)}
                </span>
              )}
            </div>
            {order.payment?.transactionId && (
              <p className="mt-2 font-mono text-xs text-ink-muted">
                trxID: {order.payment.transactionId}
              </p>
            )}
          </section>

          {/* Courier */}
          {(order.shipment ||
            order.fulfillmentStatus === "confirmed" ||
            order.fulfillmentStatus === "packed") && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">কুরিয়ার</h2>
              {order.shipment ? (
                <dl className="space-y-1 text-sm">
                  <Row label="প্রোভাইডার" value={order.shipment.provider} mono />
                  {order.shipment.consignmentId && (
                    <Row label="কনসাইনমেন্ট" value={order.shipment.consignmentId} mono />
                  )}
                  {order.shipment.trackingCode && (
                    <Row label="ট্র্যাকিং" value={order.shipment.trackingCode} mono />
                  )}
                  <Row label="স্ট্যাটাস" value={order.shipment.status} mono />
                </dl>
              ) : (
                <SendToCourierButton orderId={order.id} />
              )}
            </section>
          )}
        </div>

        {/* Aside */}
        <aside className="space-y-5">
          {/* Customer */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">গ্রাহক</h2>
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
                  aria-label="Messenger"
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
                গ্রাহকের বিস্তারিত →
              </a>
            )}
          </section>

          {/* Shipping address */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">ডেলিভারি ঠিকানা</h2>
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
              <h2 className="mb-2 text-sm font-bold text-ink">নোট</h2>
              <p className="text-sm text-ink-muted">{order.note}</p>
            </section>
          )}
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
