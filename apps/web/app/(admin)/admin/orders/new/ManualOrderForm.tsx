"use client";

// Manual Order Entry form (DESIGN §P3.4). Keyboard-first fast-lane:
//   * phone first (autofocus) → blur looks up a returning customer and inline-
//     fills name + last address (the heart of the feature).
//   * product type-ahead → Enter adds the line and refocuses search.
//   * Division→District→Thana cascade (LocationPicker).
//   * COD-confirmed default; bKash/paid toggle.
//   * sticky save bar: "অর্ডার তৈরি করুন" + "তৈরি করে আরেকটি" (save+reset+refocus).
// Ctrl/Cmd+Enter saves. No input-delaying motion — judged in milliseconds.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBdtLatin, TrashIcon, PlusIcon } from "@hybrid/ui";
import type { LocationTree } from "@/lib/location";
import {
  createManualOrder,
  lookupCustomer,
  searchProductsForPicker,
  type PickerVariant,
} from "../actions";
import { LocationPicker, type LocationValue } from "./LocationPicker";

interface Line {
  variantId: string;
  label: string;
  sku: string | null;
  unitPrice: number;
  quantity: number;
}

const EMPTY_LOCATION: LocationValue = {
  division: "",
  district: "",
  thana: "",
  divisionValue: null,
  districtValue: null,
};

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function ManualOrderForm({ locationTree }: { locationTree: LocationTree }) {
  const router = useRouter();
  const phoneRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [returningChip, setReturningChip] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [addressLine, setAddressLine] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "bkash">("cod");
  const [source, setSource] = useState<"manual" | "messenger">("manual");
  const [shipping, setShipping] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const grandTotal = subtotal + (Number(shipping) || 0);

  // Phone blur → returning-customer autofill.
  async function onPhoneBlur() {
    if (!phone.trim()) return;
    const prefill = await lookupCustomer(phone.trim());
    if (!prefill) {
      setReturningChip(null);
      return;
    }
    if (prefill.name && !name) setName(prefill.name);
    setReturningChip(prefill.name ?? "আগের গ্রাহক");
    const a = prefill.address;
    if (a) {
      // Match the saved Bangla titles back to the cascade values so the pickers
      // show the right disabled/enabled state.
      const division = locationTree.divisions.find((d) => d.bn === a.division);
      const districts = division
        ? (locationTree.districtsByDivision[division.value] ?? [])
        : [];
      const district = districts.find((d) => d.bn === a.district);
      setLocation({
        division: a.division ?? "",
        district: a.district ?? "",
        thana: a.thana ?? "",
        divisionValue: division?.value ?? null,
        districtValue: district?.value ?? null,
      });
      if (a.line) setAddressLine(a.line);
    }
  }

  function addLine(variant: PickerVariant) {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variant.variantId);
      if (existing) {
        return prev.map((l) =>
          l.variantId === variant.variantId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      const label = variant.variantTitle
        ? `${variant.productTitle} — ${variant.variantTitle}`
        : variant.productTitle;
      return [
        ...prev,
        {
          variantId: variant.variantId,
          label,
          sku: variant.sku,
          unitPrice: variant.price,
          quantity: 1,
        },
      ];
    });
  }

  function setQty(variantId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(1, qty) } : l)),
    );
  }

  function setPrice(variantId: string, price: number) {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, unitPrice: Math.max(0, price) } : l)),
    );
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  function resetForm() {
    setPhone("");
    setName("");
    setReturningChip(null);
    setLocation(EMPTY_LOCATION);
    setAddressLine("");
    setLines([]);
    setPaymentMethod("cod");
    setShipping("0");
    setNote("");
    setError(null);
    requestAnimationFrame(() => phoneRef.current?.focus());
  }

  function submit(another: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("phone", phone.trim());
    fd.set("name", name.trim());
    fd.set("division", location.division);
    fd.set("district", location.district);
    fd.set("thana", location.thana);
    fd.set("line", addressLine.trim());
    fd.set("paymentMethod", paymentMethod);
    fd.set("source", source);
    fd.set("shippingTotal", shipping || "0");
    fd.set("note", note.trim());
    fd.set(
      "items",
      JSON.stringify(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }))),
    );

    startTransition(async () => {
      const result = await createManualOrder(null, fd);
      if (!result.ok) {
        setError(result.error ?? "অর্ডার তৈরি ব্যর্থ হয়েছে।");
        return;
      }
      if (another) resetForm();
      else if (result.orderId) router.push(`/admin/orders/${result.orderId}`);
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) submit(false);
    }
  }

  const canSubmit =
    phone.trim().length >= 6 &&
    name.trim().length > 0 &&
    location.division !== "" &&
    location.district !== "" &&
    location.thana !== "" &&
    lines.length > 0 &&
    !pending;

  return (
    <div onKeyDown={onKeyDown} className="space-y-5 pb-28">
      {/* Customer */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-semibold text-ink">
            ফোন নম্বর
          </label>
          <input
            ref={phoneRef}
            id="phone"
            type="tel"
            inputMode="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={onPhoneBlur}
            placeholder="01XXXXXXXXX"
            className={`${inputCls} font-mono tnum`}
          />
          {returningChip && (
            <button
              type="button"
              onClick={() => setReturningChip(null)}
              className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary-weak px-2 py-0.5 text-2xs font-semibold text-primary"
            >
              আগের গ্রাহক — {returningChip} ✕
            </button>
          )}
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-semibold text-ink">
            নাম
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="গ্রাহকের নাম"
            className={inputCls}
          />
        </div>
      </section>

      {/* Products */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-bold text-ink">পণ্য যোগ করুন</h2>
        <ProductPicker onAdd={addLine} />
        {lines.length > 0 && (
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={l.variantId} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{l.label}</p>
                  {l.sku && <p className="font-mono text-2xs text-ink-subtle">{l.sku}</p>}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={l.quantity}
                  onChange={(e) => setQty(l.variantId, Number(e.target.value))}
                  aria-label="পরিমাণ"
                  className="h-9 w-14 rounded-sm border border-border-strong bg-surface px-2 text-center font-mono text-sm text-ink tnum"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={l.unitPrice}
                  onChange={(e) => setPrice(l.variantId, Number(e.target.value))}
                  aria-label="দাম"
                  className="h-9 w-20 rounded-sm border border-border-strong bg-surface px-2 text-right font-mono text-sm text-ink tnum"
                />
                <span className="w-20 text-right font-mono text-sm font-semibold text-ink tnum">
                  {formatBdtLatin(l.unitPrice * l.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(l.variantId)}
                  aria-label="সরান"
                  className="text-ink-subtle hover:text-danger"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Address */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-bold text-ink">ঠিকানা</h2>
        <LocationPicker tree={locationTree} value={location} onChange={setLocation} />
        <div>
          <label htmlFor="line" className="mb-1 block text-sm font-semibold text-ink">
            বিস্তারিত ঠিকানা
          </label>
          <textarea
            id="line"
            rows={2}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder="বাসা, রোড, এলাকা"
            className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary"
          />
        </div>
      </section>

      {/* Payment + delivery */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-bold text-ink">পেমেন্ট</h2>
        <div className="flex gap-2">
          <PayToggle active={paymentMethod === "cod"} onClick={() => setPaymentMethod("cod")} tone="cod">
            ক্যাশ অন ডেলিভারি
          </PayToggle>
          <PayToggle active={paymentMethod === "bkash"} onClick={() => setPaymentMethod("bkash")} tone="bkash">
            বিকাশ
          </PayToggle>
        </div>
        <div className="max-w-[220px]">
          <label htmlFor="order-source" className="mb-1 block text-sm font-semibold text-ink">চ্যানেল</label>
          <select
            id="order-source"
            value={source}
            onChange={(e) => setSource(e.target.value as "manual" | "messenger")}
            className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="manual">ম্যানুয়াল / ফোন</option>
            <option value="messenger">মেসেঞ্জার / চ্যাট</option>
          </select>
        </div>
        <div className="max-w-[200px]">
          <label htmlFor="shipping" className="mb-1 block text-sm font-semibold text-ink">
            ডেলিভারি চার্জ (৳)
          </label>
          <input
            id="shipping"
            type="number"
            inputMode="numeric"
            min={0}
            value={shipping}
            onChange={(e) => setShipping(e.target.value)}
            className={`${inputCls} font-mono tnum`}
          />
        </div>
        <div>
          <label htmlFor="note" className="mb-1 block text-sm font-semibold text-ink">
            নোট (ঐচ্ছিক)
          </label>
          <input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
          />
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg lg:left-60">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="text-2xs text-ink-muted">সর্বমোট</p>
            <p className="font-mono text-lg font-bold text-ink tnum">{formatBdtLatin(grandTotal)}</p>
          </div>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={!canSubmit}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-subtle"
          >
            তৈরি করে আরেকটি
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={!canSubmit}
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle disabled:shadow-none"
          >
            {pending ? "তৈরি হচ্ছে…" : "অর্ডার তৈরি করুন"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayToggle({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "cod" | "bkash";
  children: React.ReactNode;
}) {
  const activeCls =
    tone === "cod" ? "border-cod bg-cod-weak text-cod" : "border-bkash bg-bkash-weak text-bkash-text";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 flex-1 rounded-md border-2 px-3 text-sm font-semibold ${
        active ? activeCls : "border-border bg-surface text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}

// Product type-ahead. Enter adds the top result and refocuses the search.
function ProductPicker({ onAdd }: { onAdd: (v: PickerVariant) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerVariant[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(value: string) {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      const found = await searchProductsForPicker(value);
      setResults(found);
      setOpen(true);
    }, 200);
  }

  function pick(variant: PickerVariant) {
    onAdd(variant);
    setQuery("");
    setResults([]);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (results[0]) pick(results[0]);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="পণ্যের নাম বা SKU দিয়ে খুঁজুন (Enter দিয়ে যোগ করুন)"
        className={inputCls}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-dropdown mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-md">
          {results.map((r) => {
            const oos = r.trackInventory && r.inventory <= 0;
            return (
              <li key={r.variantId}>
                <button
                  type="button"
                  disabled={oos}
                  onClick={() => pick(r)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary-weak text-primary">
                    <PlusIcon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {r.variantTitle ? `${r.productTitle} — ${r.variantTitle}` : r.productTitle}
                    </span>
                    {r.sku && <span className="font-mono text-2xs text-ink-subtle">{r.sku}</span>}
                  </span>
                  <span className="font-mono text-sm text-ink tnum">{formatBdtLatin(r.price)}</span>
                  {oos && <span className="text-2xs font-semibold text-danger">স্টক নেই</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
