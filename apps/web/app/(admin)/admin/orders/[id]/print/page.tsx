import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getOrderDetail } from "@/lib/admin/orders";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { PrintTrigger } from "./PrintTrigger";

// Printable invoice / packing slip (DESIGN §P3.5). Print-only layout: black ink
// on white, no warm-paper bg, no shadows. Latin numerals, mono for IDs/amounts.
// Bangla for human-readable name/address (the courier reads Bangla). COD amount
// is rendered LARGE — the single most error-prone field.
interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}

export default async function OrderPrintPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params;
  const { doc } = await searchParams;
  const isPacking = doc === "packing";

  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const order = await getOrderDetail(tenantId, session.userId, id);
  if (!order) notFound();

  const addr = order.shippingAddress;
  const addressLine = [addr.line, addr.thana, addr.district, addr.division]
    .filter(Boolean)
    .join(", ");

  const { locale, d } = await getDict();
  const t = d.admin.ordersDetail.print;

  return (
    <div className="print-doc mx-auto max-w-[760px] bg-white p-6 text-black">
      <PrintTrigger />

      {/* Screen-only controls (hidden in print) */}
      <div className="no-print mb-4 flex items-center justify-between">
        <a href={`/admin/orders/${order.id}`} className="text-sm text-ink-muted hover:text-primary">
          {t.backToOrder}
        </a>
        <button
          type="button"
          data-print-button
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-white"
        >
          {t.print}
        </button>
      </div>

      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold">
            {isPacking ? t.packingSlip : t.invoice}
          </h1>
          <p className="font-mono text-sm">{t.orderPrefix} #{order.orderNumber}</p>
        </div>
        <p className="text-right font-mono text-xs">{formatDate(order.placedAt)}</p>
      </header>

      {/* Recipient block — large for packing slip (the courier reads this) */}
      <section className={`mt-4 ${isPacking ? "text-base" : "text-sm"}`}>
        <p className="text-xs font-bold uppercase">{t.recipient}</p>
        <p className={isPacking ? "text-lg font-bold" : "font-semibold"}>
          {addr.recipient ?? order.customerName ?? "—"}
        </p>
        <p className="font-mono">{addr.phone ?? order.customerPhone}</p>
        <p>{addressLine}</p>
      </section>

      {/* COD amount — unmissable */}
      {order.codAmount > 0 && (
        <section className="mt-4 border-2 border-black p-3 text-center">
          <p className="text-xs font-bold uppercase">{t.collectCod}</p>
          <p className="font-mono text-3xl font-extrabold">{formatMoney(order.codAmount, locale)}</p>
        </section>
      )}

      {/* Line items */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-2 font-bold">{t.colProduct}</th>
            {isPacking ? (
              <th className="w-16 py-1 text-center font-bold">✓</th>
            ) : (
              <th className="py-1 text-right font-bold">{t.colPrice}</th>
            )}
            <th className="w-12 py-1 text-center font-bold">{t.colQuantity}</th>
            {!isPacking && <th className="py-1 text-right font-bold">{t.colTotal}</th>}
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => (
            <tr key={it.id} className="border-b border-gray-300 align-top">
              <td className="py-1.5 pr-2">
                {it.title}
                {it.variantTitle && <span className="text-gray-600"> — {it.variantTitle}</span>}
                {it.sku && <div className="font-mono text-xs text-gray-600">{it.sku}</div>}
              </td>
              {isPacking ? (
                <td className="py-1.5 text-center text-lg">☐</td>
              ) : (
                <td className="py-1.5 text-right font-mono tnum">
                  {formatMoney(it.unitPrice, locale)}
                </td>
              )}
              <td className="py-1.5 text-center font-mono tnum">{it.quantity}</td>
              {!isPacking && (
                <td className="py-1.5 text-right font-mono tnum">
                  {formatMoney(it.lineTotal, locale)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals (invoice only) */}
      {!isPacking && (
        <div className="mt-3 ml-auto w-56 space-y-1 text-sm">
          <PrintRow label={t.subtotal} value={formatMoney(order.subtotal, locale)} />
          <PrintRow label={t.delivery} value={formatMoney(order.shippingTotal, locale)} />
          <div className="flex justify-between border-t-2 border-black pt-1 font-bold">
            <span>{t.grandTotal}</span>
            <span className="font-mono tnum">{formatMoney(order.grandTotal, locale)}</span>
          </div>
          <PrintRow
            label={t.paymentLabel}
            value={order.payment?.provider === "bkash" ? t.bkash : t.cashOnDelivery}
          />
        </div>
      )}

      {/* Packing slip tracking */}
      {isPacking && order.shipment?.trackingCode && (
        <p className="mt-4 font-mono text-sm">{t.trackingPrefix} {order.shipment.trackingCode}</p>
      )}

      {!isPacking && (
        <p className="mt-6 text-center text-xs text-gray-600">
          {t.thankYou}
        </p>
      )}
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono tnum">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
