"use client";
// Wholesale checkout form. Bengali-first, with B2B features:
// - Business name field
// - Purchase request option (for credit-based buyers)
// - Credit payment method
// - Bulk order quantities
import { useEffect, useMemo, useState } from "react";
import { Button, CheckIcon } from "@hybrid/ui";
import type { LocationTree, CascadeOption } from "@/lib/location";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionaries";
import { useWholesaleCart } from "../cart/useWholesaleCart";
import { submitWholesaleCheckout, quoteWholesaleShipping } from "./actions";
import { LocationSheet } from "../../checkout/LocationSheet";

interface WholesaleCheckoutFormProps {
  tenantSlug: string;
  storeName: string;
  storePhone: string | null;
  locationTree: LocationTree;
  paymentNotice?: "failed" | "invalid" | null;
}

type Method = "cod" | "hybridpay" | "credit";

export function WholesaleCheckoutForm({
  tenantSlug,
  locationTree,
  paymentNotice,
}: WholesaleCheckoutFormProps) {
  const d = useDict();
  const locale = useLocale();
  const t = d.storefront.checkout;
  const cart = useWholesaleCart(tenantSlug);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [division, setDivision] = useState<CascadeOption | null>(null);
  const [district, setDistrict] = useState<CascadeOption | null>(null);
  const [thana, setThana] = useState<CascadeOption | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [method, setMethod] = useState<Method>("cod");
  const [asPurchaseRequest, setAsPurchaseRequest] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState<number | null>(null);

  const destDivision = division?.bn ?? null;
  const destDistrict = district?.bn ?? null;
  const itemsKey = cart.lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
  useEffect(() => {
    if (!destDivision || !destDistrict || cart.lines.length === 0) {
      setShipping(null);
      return;
    }
    let cancelled = false;
    void quoteWholesaleShipping({
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
  }, [tenantSlug, destDivision, destDistrict, itemsKey, cart.lines]);

  const districts = useMemo(
    () => (division ? (locationTree.districtsByDivision[division.value] ?? []) : []),
    [division, locationTree],
  );
  const thanas = useMemo(
    () => (district ? (locationTree.thanasByDistrict[district.value] ?? []) : []),
    [district, locationTree],
  );

  const phoneDigits = phone.replace(/[^\d০-৯]/g, "");
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

    const result = await submitWholesaleCheckout({
      tenantSlug,
      phone,
      name: name.trim(),
      businessName: businessName.trim() || undefined,
      division: division!.bn,
      district: district!.bn,
      thana: thana!.bn,
      addressLine: addressLine.trim(),
      paymentMethod: method,
      note: note.trim() || undefined,
      discountCode: promoCode.trim() || undefined,
      items: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      asPurchaseRequest,
    });

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.method === "hybridpay") {
      cart.clear();
      window.location.href = result.redirectURL;
      return;
    }

    if (result.method === "purchase_request") {
      cart.clear();
      window.location.href = `/wholesale/pr/${result.prNumber}?phone=${encodeURIComponent(phoneDigits)}`;
      return;
    }

    // COD or credit — order confirmed
    cart.clear();
    window.location.href = `/order/${result.orderNumber}?phone=${encodeURIComponent(phoneDigits)}`;
  }

  const confirmLabel = asPurchaseRequest
    ? "পারচেজ রিকোয়েস্ট জমা দিন"
    : method === "hybridpay"
      ? t.payWithHybridpay
      : method === "credit"
        ? "ক্রেডিটে অর্ডার করুন"
        : t.placeOrder;

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
        {/* Phone */}
        <Field label="📱 মোবাইল নম্বর">
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

        <Field label="👤 নাম">
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="আপনার নাম"
            className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle"
          />
        </Field>

        <Field label="🏢 প্রতিষ্ঠানের নাম (ঐচ্ছিক)">
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="আপনার প্রতিষ্ঠানের নাম"
            className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle"
          />
        </Field>

        {/* Address cascade */}
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

        {/* Payment method */}
        <fieldset className="flex flex-col gap-3">
          <legend className="bn-body mb-1 text-sm font-semibold text-ink">
            💳 পেমেন্ট পদ্ধতি
          </legend>

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
          <PaymentCard
            selected={method === "credit"}
            onSelect={() => setMethod("credit")}
            tone="credit"
            icon={<CreditIcon width={20} height={20} />}
            title="ক্রেডিট (বিল পরিশোধ)"
            subtitle="পূর্বনির্ধারিত ক্রেডিট লিমিটের মধ্যে অর্ডার করুন"
          />
        </fieldset>

        {/* Purchase request toggle */}
        <label className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <input
            type="checkbox"
            checked={asPurchaseRequest}
            onChange={(e) => setAsPurchaseRequest(e.target.checked)}
            className="h-4 w-4 rounded border-border-strong text-primary"
          />
          <div className="flex flex-col">
            <span className="bn-body text-sm font-medium text-ink">
              📋 পারচেজ রিকোয়েস্ট হিসাবে জমা দিন
            </span>
            <span className="text-2xs text-ink-muted">
              সরাসরি অর্ডার না করে বিক্রেতার কাছ থেকে কোটেশন চান
            </span>
          </div>
        </label>

        {/* Note */}
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

        {/* Promo code */}
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

        {/* Order summary */}
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
          locale={locale}
          d={d}
        />

        {error && (
          <p className="rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </form>

      {/* Sticky confirm bar */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg">
        <div className="mx-auto flex max-w-[480px] items-center gap-3 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-2xs text-ink-muted">{t.total}</span>
            <span className="text-lg font-bold leading-none text-ink tnum">
              {formatMoney(cart.subtotal + (shipping ?? 0), locale)}
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
              ? asPurchaseRequest
                ? "জমা দেওয়া হচ্ছে..."
                : method === "hybridpay"
                  ? t.hybridpayProcessing
                  : t.placingOrder
              : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="bn-body text-sm font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

function HybridPayIcon({ width = 20, height = 20 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function CreditIcon({ width = 20, height = 20 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}

interface PaymentCardProps {
  selected: boolean;
  onSelect: () => void;
  tone: "cod" | "hybridpay" | "credit";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  reassurance?: string;
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
      : tone === "credit"
        ? selected
          ? "border-amber-500 ring-2 ring-amber-500 bg-amber-50"
          : "border-border bg-surface"
        : selected
          ? "border-primary ring-2 ring-primary bg-primary-weak"
          : "border-border bg-surface";
  const iconColor =
    tone === "cod" ? "text-cod" : tone === "credit" ? "text-amber-600" : "text-primary";

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
  locale,
  d,
}: {
  lines: SummaryLine[];
  subtotal: number;
  shipping: number | null;
  locale: Locale;
  d: Messages;
}) {
  const t = d.storefront.checkout;
  const total = subtotal + (shipping ?? 0);
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
      <div className="flex items-center justify-between">
        <span className="bn-body text-base font-bold text-ink">{t.total}</span>
        <span className="text-2xl font-bold text-ink tnum">{formatMoney(total, locale)}</span>
      </div>
    </div>
  );
}
