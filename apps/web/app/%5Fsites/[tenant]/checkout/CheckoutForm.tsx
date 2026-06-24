"use client";
// Storefront checkout form (DESIGN P1). Mobile-first, Bengali-first, Bangla
// numerals. Phone-first, minimum fields, COD default (loudest, COD-green) +
// bKash (single pink), Division→District→Thana bottom sheets, order summary,
// sticky "অর্ডার করুন" bar. Submits to the submitCheckout Server Action.
import { useMemo, useState } from "react";
import { Button, formatBdtBangla, toBnDigits, BkashIcon, CheckIcon } from "@hybrid/ui";
import type { LocationTree, CascadeOption } from "@/lib/location";
import { useCart } from "../cart/useCart";
import { submitCheckout } from "./actions";
import { LocationSheet } from "./LocationSheet";

interface CheckoutFormProps {
  tenantSlug: string;
  storeName: string;
  storePhone: string | null;
  locationTree: LocationTree;
  /** ?payment=failed/invalid surfaced from a returned bKash callback. */
  paymentNotice?: "failed" | "invalid" | null;
}

type Method = "cod" | "bkash";

export function CheckoutForm({
  tenantSlug,
  locationTree,
  paymentNotice,
}: CheckoutFormProps) {
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
    });

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.method === "bkash") {
      // Hand off to the tokenized bKash popup/iframe. The callback redirects
      // back to /order/N (or /checkout?payment=failed). Clear cart on handoff.
      cart.clear();
      window.location.href = result.bkashURL;
      return;
    }

    // COD — order confirmed; go to the success/track page. Carry the phone so
    // the gated page renders immediately (it's the buyer's own number = token).
    cart.clear();
    window.location.href = `/order/${result.orderNumber}?phone=${encodeURIComponent(phoneDigits)}`;
  }

  const confirmLabel =
    method === "bkash" ? "বিকাশে পেমেন্ট করুন" : "অর্ডার করুন";

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-32 pt-4">
      {paymentNotice && (
        <p className="mb-4 rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">
          {paymentNotice === "failed"
            ? "বিকাশ পেমেন্ট সম্পন্ন হয়নি। আবার চেষ্টা করুন বা ক্যাশ অন ডেলিভারি বেছে নিন।"
            : "পেমেন্টে সমস্যা হয়েছে।"}
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
        <Field label="ফোন নম্বর">
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

        <Field label="নাম">
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="আপনার নাম"
            className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle"
          />
        </Field>

        {/* Address cascade — bottom sheets. */}
        <LocationSheet
          label="বিভাগ"
          value={division?.bn ?? null}
          options={locationTree.divisions}
          placeholder="বিভাগ নির্বাচন করুন"
          countNoun="বিভাগ"
          onSelect={(o) => {
            setDivision(o);
            setDistrict(null);
            setThana(null);
          }}
        />
        <LocationSheet
          label="জেলা"
          value={district?.bn ?? null}
          options={districts}
          disabled={division == null}
          placeholder="জেলা নির্বাচন করুন"
          countNoun="জেলা"
          onSelect={(o) => {
            setDistrict(o);
            setThana(null);
          }}
        />
        <LocationSheet
          label="থানা / উপজেলা"
          value={thana?.bn ?? null}
          options={thanas}
          disabled={district == null}
          placeholder="থানা নির্বাচন করুন"
          countNoun="থানা"
          onSelect={setThana}
        />

        <Field label="বিস্তারিত ঠিকানা">
          <textarea
            rows={2}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder="বাসা/হোল্ডিং, রোড, এলাকা"
            className="rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle"
          />
        </Field>

        {/* Payment method — COD loudest, bKash single pink. */}
        <fieldset className="flex flex-col gap-3">
          <legend className="bn-body mb-1 text-sm font-semibold text-ink">পেমেন্ট মাধ্যম</legend>

          <PaymentCard
            selected={method === "cod"}
            onSelect={() => setMethod("cod")}
            tone="cod"
            icon={<CheckIcon width={20} height={20} />}
            title="ক্যাশ অন ডেলিভারি"
            subtitle="পণ্য হাতে পেয়ে টাকা দিন"
            reassurance="✓ অগ্রিম টাকা লাগবে না"
          />
          <PaymentCard
            selected={method === "bkash"}
            onSelect={() => setMethod("bkash")}
            tone="bkash"
            icon={<BkashIcon width={20} height={20} />}
            title="বিকাশ"
            subtitle="এখনই পেমেন্ট করুন"
          />
        </fieldset>

        {/* Optional note — collapsed by default. */}
        {showNote ? (
          <Field label="অর্ডার নোট">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="বিশেষ নির্দেশনা (ঐচ্ছিক)"
              className="rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle"
            />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="w-fit text-sm font-medium text-primary"
          >
            ✎ অর্ডার নোট যোগ করুন
          </button>
        )}

        {/* Promo code — optional. Server validates + applies on submit; no
            client-side preview (avoids a pre-check race with usage limits). */}
        <Field label="প্রোমো কোড (ঐচ্ছিক)">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="কোড থাকলে লিখুন"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base uppercase text-ink placeholder:normal-case placeholder:text-ink-subtle"
          />
        </Field>

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
        />

        {error && (
          <p className="rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </form>

      {/* Sticky confirm bar (DESIGN P1.6). Indigo regardless of method. */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg">
        <div className="mx-auto flex max-w-[480px] items-center gap-3 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-2xs text-ink-muted">সর্বমোট</span>
            <span className="text-lg font-bold leading-none text-ink tnum">
              {formatBdtBangla(cart.subtotal)}
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
              ? method === "bkash"
                ? "বিকাশ পেমেন্ট চলছে…"
                : "অর্ডার হচ্ছে…"
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
  tone: "cod" | "bkash";
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
      : selected
        ? "border-bkash ring-2 ring-bkash bg-bkash-weak"
        : "border-border bg-surface";
  const iconColor = tone === "cod" ? "text-cod" : "text-bkash";

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

function OrderSummary({ lines, subtotal }: { lines: SummaryLine[]; subtotal: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <span className="bn-body text-sm font-semibold text-ink">অর্ডার সারাংশ</span>
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
              <span className="text-ink-muted">× {toBnDigits(line.quantity)}</span>
            </span>
            <span className="text-sm font-semibold text-ink tnum">
              {formatBdtBangla(line.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="bn-body text-sm text-ink-muted">সাবটোটাল</span>
        <span className="text-sm font-semibold text-ink tnum">{formatBdtBangla(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="bn-body text-base font-bold text-ink">সর্বমোট</span>
        <span className="text-2xl font-bold text-ink tnum">{formatBdtBangla(subtotal)}</span>
      </div>
    </div>
  );
}
