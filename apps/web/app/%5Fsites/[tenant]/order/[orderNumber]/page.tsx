import { notFound } from "next/navigation";
// Must be dynamic — searchParams (phone) is only available at request time.
export const dynamic = "force-dynamic";
import { cookies } from "next/headers";
import {
  CheckCircleIcon,
  PhoneIcon,
  StatusStepper,
} from "@hybrid/ui";
import { getStorefrontOrder, getTenantContextBySlug } from "@/lib/storefront/data";
import { preparePurchaseFire } from "@/lib/analytics/purchase";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { OrderLookup } from "./OrderLookup";
import { PurchaseTracker } from "./PurchaseTracker";

interface OrderPageProps {
  params: Promise<{ tenant: string; orderNumber: string }>;
  searchParams: Promise<{ phone?: string }>;
}

// Order success / track page (DESIGN P1.7). Buyer-facing, Bangla numerals.
// Phone-gated: without a matching ?phone it shows the lookup form (track later);
// with one it shows the confirmation + read-only status stepper + COD amount.
export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const { tenant: slug, orderNumber: orderNumberRaw } = await params;
  const { phone } = await searchParams;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const orderNumber = Number(orderNumberRaw);
  if (!Number.isInteger(orderNumber)) notFound();

  // No phone yet → render the track-later lookup form.
  if (!phone) {
    return <OrderLookup orderNumber={orderNumber} />;
  }

  const order = await getStorefrontOrder(ctx.id, orderNumber, phone);
  // Wrong phone / unknown order → lookup form again (no information leak).
  if (!order) {
    return <OrderLookup orderNumber={orderNumber} />;
  }

  const isCod = order.paymentMethod === "cod";
  const { locale, d } = await getDict();
  const t = d.storefront.order;

  // Deduped purchase fire (Phase 2.7). Fires the SERVER half (CAPI + GA4-MP +
  // internal order.placed) once — gated on payment.payload.analytics.serverFired
  // so revisiting this page never double-fires — and returns the client bundle so
  // the PurchaseTracker island fires the BROWSER half (Pixel + gtag) with the same
  // event_id. Forward the _ga cookie for GA4 client_id attribution. Returns null
  // when the tenant has no analytics configured / enabled.
  const gaCookie = (await cookies()).get("_ga")?.value ?? null;
  const purchaseFire = await preparePurchaseFire(ctx.id, orderNumber, phone, gaCookie);

  return (
    <div className="mx-auto max-w-[480px] px-4 py-8">
      {purchaseFire && (
        <PurchaseTracker
          ga4MeasurementId={purchaseFire.publicIds.ga4MeasurementId}
          fbPixelId={purchaseFire.publicIds.fbPixelId}
          payload={purchaseFire.payload}
        />
      )}
      {/* Hero confirmation. */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-cod-weak text-cod">
          <CheckCircleIcon width={36} height={36} />
        </span>
        <h1 className="bn-heading text-2xl font-bold text-ink">{t.confirmed}</h1>
        <p className="text-lg font-bold text-ink">{t.orderNumber} #{formatNumber(order.orderNumber, locale)}</p>
      </div>

      {/* Status stepper (read-only). */}
      <div className="my-8">
        <StatusStepper status={order.fulfillmentStatus} lang={locale} />
      </div>

      {/* What happens next. */}
      <div className="mb-6 flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="bn-body text-sm font-semibold text-ink">{t.whatNext}</p>
        <p className="bn-body text-sm text-ink-muted">{t.nextCall}</p>
        {isCod && (
          <p className="bn-body text-sm text-ink-muted">
            {t.nextPay.replace("{amount}", formatMoney(order.codAmount, locale))}
          </p>
        )}
      </div>

      {/* Items + total. */}
      <div className="mb-6 flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="bn-body text-sm font-semibold text-ink">{t.orderSummary}</p>
        <ul className="flex flex-col gap-1.5">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="bn-body line-clamp-1 flex-1 text-sm text-ink">
                {item.title}{" "}
                <span className="text-ink-muted">× {formatNumber(item.quantity, locale)}</span>
              </span>
              <span className="text-sm font-semibold text-ink tnum">
                {formatMoney(item.lineTotal, locale)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="bn-body text-base font-bold text-ink">{t.total}</span>
          <span className="text-lg font-bold text-ink tnum">
            {formatMoney(order.grandTotal, locale)}
          </span>
        </div>
        {isCod && (
          <div className="flex items-center justify-between">
            <span className="bn-body text-sm font-semibold text-cod">{t.collectOnDelivery}</span>
            <span className="text-sm font-bold text-cod tnum">
              {formatMoney(order.codAmount, locale)}
            </span>
          </div>
        )}
      </div>

      {/* Store contact — the COD buyer's safety net. */}
      {ctx.store.phone && (
        <a
          href={`tel:${ctx.store.phone}`}
          className="flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface py-3 text-sm font-semibold text-primary"
        >
          <PhoneIcon width={16} height={16} />
          {t.callStore} {locale === "bn" ? formatNumber(ctx.store.phone, locale) : ctx.store.phone}
        </a>
      )}
    </div>
  );
}
