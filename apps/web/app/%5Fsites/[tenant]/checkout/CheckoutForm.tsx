"use client";
// Storefront checkout form (DESIGN P1). Mobile-first, Bengali-first, Bangla
// numerals. Phone-first, minimum fields, COD default (loudest, COD-green) +
// bKash (single pink), Division→District→Thana bottom sheets, order summary,
// sticky "অর্ডার করুন" bar. Submits to the submitCheckout Server Action.
import { useEffect, useMemo, useState } from "react";
import { Button, CheckIcon } from "@hybrid/ui";
import type { LocationTree, CascadeOption } from "@/lib/location";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionaries";
import { useCart } from "../cart/useCart";
import { submitCheckout, quoteShipping } from "./actions";
import { persistCart } from "@/lib/marketing/cartPersist";
import { LocationSheet } from "./LocationSheet";

interface CheckoutFormProps {
  tenantSlug: string;
  tenantId: string;
  storeName: string;
  storePhone: string | null;
  locationTree: LocationTree;
  /** ?payment=failed/invalid surfaced from a returned Hybrid Pay callback. */
  paymentNotice?: "failed" | "invalid" | null;
  /** Landing-page slug; non-null when arriving via a funnel (?lp=<slug>). */
  lpSlug?: string | null;
  /** Order-bump upsells loaded from the LP's funnel_config. Empty for regular checkout. */
  upsells?: Array<{ label: string; bump_price: number }>;
  /** When set, redirect here after COD order success instead of /order/{n}. */
  postCheckoutUpsellPath?: string | null;
}

// Storefront shows one online option, "Hybrid Pay" (it subsumes bKash/Nagad —
// the buyer picks the underlying method on Hybrid Pay's hosted page) plus COD.
type Method = "cod" | "hybridpay";

export function CheckoutForm({
  tenantSlug,
  tenantId,
  locationTree,
  paymentNotice,
  lpSlug,
  upsells = [],
  postCheckoutUpsellPath,
}: CheckoutFormProps) {
  const d = useDict();
  const locale = useLocale();
  const t = d.storefront.checkout;
  const cart = useCart(tenantSlug);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [division, setDivision] = useState<CascadeOption | null>(null);
  const [district, setDistrict] = useState<CascadeOption | null>(null);
  const [thana, setThana] = useState<CascadeOption | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [method, setMethod] = useState<Method>("cod");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live shipping charge for display (null = not configured / not yet quoted).
  // The authoritative value is re-computed server-side at submit.
  const [shipping, setShipping] = useState<number | null>(null);
  // Order bumps selected by the buyer (labels of chosen upsells from LP funnel).
  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(new Set());
  const bumpTotal = upsells
    .filter((u) => selectedBumps.has(u.label))
    .reduce((sum, u) => sum + u.bump_price, 0);

  // Quote shipping whenever the destination (division+district) or cart changes.
  const destDivision = division?.bn ?? null;
  const destDistrict = district?.bn ?? null;
  const itemsKey = cart.lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
  useEffect(() => {
    if (!destDivision || !destDistrict || cart.lines.length === 0) {
      setShipping(null);
      return;
    }
    let cancelled = false;
    void quoteShipping({
      tenantSlug,
      division: destDivision,
      district: destDistrict,
      items: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    }).then((res) => {
      if (!cancelled) setShipping(res.amount);
    });
    return () => {
      cancelled = true;
    };
    // itemsKey captures cart line changes; cart.lines is derived from it.
  }, [tenantSlug, destDivision, destDistrict, itemsKey, cart.lines]);

  const districts = useMemo(
    () => (division ? (locationTree.districtsByDivision[division.value] ?? []) : []),
    [division, locationTree],
  );
  const thanas = useMemo(
    () => (district ? (locationTree.thanasByDistrict[district.value] ?? []) : []),
    [district, locationTree],
  );

  // Persist cart to DB once phone has enough digits + cart has items.
  // Debounced 1.5 s so we don't fire on every keystroke. This enables the
  // abandoned-cart recovery sweep to find half-completed checkouts.
  const phoneDigits = phone.replace(/[^\d০-৯]/g, "");
  useEffect(() => {
    if (phoneDigits.length < 9 || cart.lines.length === 0) return;
    const timer = setTimeout(() => {
      void persistCart(
        tenantId,
        phoneDigits,
        cart.lines.map((l) => ({
          productSlug: l.productSlug,
          variantId: l.variantId,
          title: l.title,
          qty: l.quantity,
          unitPrice: l.price,
        })),
        cart.subtotal,
      ).catch(() => null);
    }, 1500);
    return () => clearTimeout(timer);
  }, [tenantId, phoneDigits, itemsKey, cart.lines, cart.subtotal]);

  const isComplete =
    phoneDigits.length >= 6 &&
    name.trim().length > 0 &&
    division != null &&
    district != null &&
    thana != null &&
    addressLine.trim().length > 0 &&
    cart.lines.length > 0;

  async function handleSubmit() {
    if (!isComplete || submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await submitCheckout({
      tenantSlug,
      phone,
      name: name.trim(),
      division: division!.bn,
      district: district!.bn,
      thana: thana!.bn,
      addressLine: addressLine.trim(),
      paymentMethod: method,
      note: note.trim() || undefined,
      discountCode: promoCode.trim() || undefined,
      items: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      lpSlug: lpSlug ?? undefined,
      selectedBumpLabels: selectedBumps.size > 0 ? [...selectedBumps] : undefined,
    });

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.method === "hybridpay") {
      // Hand off to the Hybrid Pay hosted page. The webhook/return redirects
      // back to /order/N (or /checkout?payment=failed). Clear cart on handoff.
      cart.clear();
      window.location.href = result.redirectURL;
      return;
    }

    // COD — order confirmed. If a post-checkout upsell path is configured (LP
    // funnel multi-step), go there; otherwise go to the order confirmation page.
    cart.clear();
    if (postCheckoutUpsellPath) {
      window.location.href = `${postCheckoutUpsellPath}/${result.orderNumber}?phone=${encodeURIComponent(phoneDigits)}`;
    } else {
      window.location.href = `/order/${result.orderNumber}?phone=${encodeURIComponent(phoneDigits)}`;
    }
  }

  const confirmLabel =
    method === "hybridpay" ? t.payWithHybridpay : t.placeOrder;

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-32 pt-4">
      {paymentNotice && (
        <p className="mb-4 rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">
          {paymentNotice === "failed" ? t.paymentFailed : t.paymentInvalid}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        {/* Phone — first field on purpose (COD identity key). */}
        <Field label={t.phoneLabel}>
          <input
            type="tel"
            inputMode="tel"
            autoFocus
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle"
          />
        </Field>

        <Field label={t.nameLabel}>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle"
          />
        </Field>

        {/* Address cascade — bottom sheets. */}
        <LocationSheet
          label={t.divisionLabel}
          value={division?.bn ?? null}
          options={locationTree.divisions}
          placeholder={t.divisionPlaceholder}
          countNoun={t.divisionNoun}
          onSelect={(o) => {
            setDivision(o);
            setDistrict(null);
            setThana(null);
          }}
        />
        <LocationSheet
          label={t.districtLabel}
          value={district?.bn ?? null}
          options={districts}
          disabled={division == null}
          placeholder={t.districtPlaceholder}
          countNoun={t.districtNoun}
          onSelect={(o) => {
            setDistrict(o);
            setThana(null);
          }}
        />
        <LocationSheet
          label={t.thanaLabel}
          value={thana?.bn ?? null}
          options={thanas}
          disabled={district == null}
          placeholder={t.thanaPlaceholder}
          countNoun={t.thanaNoun}
          onSelect={setThana}
        />

        <Field label={t.addressLabel}>
          <textarea
            rows={2}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder={t.addressPlaceholder}
            className="rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle"
          />
        </Field>

        {/* Payment method — COD loudest, Hybrid Pay (the single online option). */}
        <fieldset className="flex flex-col gap-3">
          <legend className="bn-body mb-1 text-sm font-semibold text-ink">{t.paymentMethod}</legend>

          <PaymentCard
            selected={method === "cod"}
            onSelect={() => setMethod("cod")}
            tone="cod"
            icon={<CheckIcon width={20} height={20} />}
            title={t.codTitle}
            subtitle={t.codSubtitle}
            reassurance={t.codReassurance}
          />
          <PaymentCard
            selected={method === "hybridpay"}
            onSelect={() => setMethod("hybridpay")}
            tone="hybridpay"
            icon={<HybridPayIcon width={20} height={20} />}
            title={t.hybridpayTitle}
            subtitle={t.hybridpaySubtitle}
          />
        </fieldset>

        {/* Optional note — collapsed by default. */}
        {showNote ? (
          <Field label={t.noteLabel}>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
              className="rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle"
            />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="w-fit text-sm font-medium text-primary"
          >
            {t.addNote}
          </button>
        )}

        {/* Promo code — optional. Server validates + applies on submit; no
            client-side preview (avoids a pre-check race with usage limits). */}
        <Field label={t.promoLabel}>
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder={t.promoPlaceholder}
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base uppercase text-ink placeholder:normal-case placeholder:text-ink-subtle"
          />
        </Field>

        {/* Order bumps / upsells from LP funnel. Shown only when ?lp=<slug>. */}
        {upsells.length > 0 && (
          <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <p className="text-xs font-semibold text-accent">✨ বিশেষ অফার</p>
            {upsells.map((u) => (
              <label
                key={u.label}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={selectedBumps.has(u.label)}
                  onChange={(e) => {
                    setSelectedBumps((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(u.label);
                      else next.delete(u.label);
                      return next;
                    });
                  }}
                />
                <span className="min-w-0 flex-1 text-sm text-ink">{u.label}</span>
                <span className="shrink-0 font-mono text-sm font-semibold text-primary tnum">
                  +{formatMoney(u.bump_price, locale)}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Order summary. */}
        <OrderSummary
          lines={cart.lines.map((l) => ({
            key: l.variantId,
            title: l.title,
            quantity: l.quantity,
            lineTotal: l.price * l.quantity,
            imageUrl: l.imageUrl ?? null,
          }))}
          subtotal={cart.subtotal}
          shipping={shipping}
          bumpTotal={bumpTotal}
          locale={locale}
          d={d}
        />

        {error && (
          <p className="rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </form>

      {/* Sticky confirm bar (DESIGN P1.6). Indigo regardless of method. */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg">
        <div className="mx-auto flex max-w-[480px] items-center gap-3 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-2xs text-ink-muted">{t.total}</span>
            <span className="text-lg font-bold leading-none text-ink tnum">
              {formatMoney(cart.subtotal + (shipping ?? 0) + bumpTotal, locale)}
            </span>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="h-[52px] flex-1"
            disabled={!isComplete || submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? method === "hybridpay"
                ? t.hybridpayProcessing
                : t.placingOrder
              : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="bn-body text-sm font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

interface PaymentCardProps {
  selected: boolean;
  onSelect: () => void;
  tone: "cod" | "hybridpay";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  reassurance?: string;
}

// Hybrid Pay glyph — a simple wallet mark in the brand indigo (currentColor).
function HybridPayIcon({ width = 20, height = 20 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PaymentCard({
  selected,
  onSelect,
  tone,
  icon,
  title,
  subtitle,
  reassurance,
}: PaymentCardProps) {
  const ring =
    tone === "cod"
      ? selected
        ? "border-cod ring-2 ring-cod bg-cod-weak"
        : "border-border bg-surface"
      : selected
        ? "border-primary ring-2 ring-primary bg-primary-weak"
        : "border-border bg-surface";
  const iconColor = tone === "cod" ? "text-cod" : "text-primary";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-h-16 w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${ring}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconColor}`}>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="bn-body text-base font-semibold text-ink">{title}</span>
        <span className="text-xs text-ink-muted">{subtitle}</span>
        {reassurance && <span className="mt-0.5 text-2xs font-semibold text-cod">{reassurance}</span>}
      </span>
    </button>
  );
}

interface SummaryLine {
  key: string;
  title: string;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
}

function OrderSummary({
  lines,
  subtotal,
  shipping,
  bumpTotal = 0,
  locale,
  d,
}: {
  lines: SummaryLine[];
  subtotal: number;
  shipping: number | null;
  bumpTotal?: number;
  locale: Locale;
  d: Messages;
}) {
  const t = d.storefront.checkout;
  const total = subtotal + (shipping ?? 0) + bumpTotal;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <span className="bn-body text-sm font-semibold text-ink">{t.orderSummary}</span>
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line.key} className="flex items-center gap-2">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {line.imageUrl && (
                <img src={line.imageUrl} alt={line.title} className="h-full w-full object-cover" />
              )}
            </div>
            <span className="bn-body line-clamp-1 flex-1 text-sm text-ink">
              {line.title}{" "}
              <span className="text-ink-muted">× {formatNumber(line.quantity, locale)}</span>
            </span>
            <span className="text-sm font-semibold text-ink tnum">
              {formatMoney(line.lineTotal, locale)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="bn-body text-sm text-ink-muted">{t.subtotal}</span>
        <span className="text-sm font-semibold text-ink tnum">{formatMoney(subtotal, locale)}</span>
      </div>
      {shipping != null && (
        <div className="flex items-center justify-between">
          <span className="bn-body text-sm text-ink-muted">{t.shipping}</span>
          <span className="text-sm font-semibold text-ink tnum">
            {shipping === 0 ? t.freeShipping : formatMoney(shipping, locale)}
          </span>
        </div>
      )}
      {bumpTotal > 0 && (
        <div className="flex items-center justify-between">
          <span className="bn-body text-sm text-ink-muted">বিশেষ অফার</span>
          <span className="text-sm font-semibold text-accent tnum">+{formatMoney(bumpTotal, locale)}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="bn-body text-base font-bold text-ink">{t.total}</span>
        <span className="text-2xl font-bold text-ink tnum">{formatMoney(total, locale)}</span>
      </div>
    </div>
  );
}
