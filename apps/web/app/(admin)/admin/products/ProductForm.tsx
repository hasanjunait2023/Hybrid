"use client";

// Product create/edit form (DESIGN §P4). Single column ≤ md, main + aside ≥ lg.
//   * Main: নাম · বিবরণ · ছবি (upload + reorder) · ভ্যারিয়েন্ট (matrix).
//   * Aside: স্ট্যাটাস · কালেকশন.
// The variant matrix is the cartesian product of the options; bulk-fill helpers
// (all-price / all-stock) keep entry fast. Posts createProduct/updateProduct,
// which persist options/variants/images/collections atomically.
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, TrashIcon, PlusIcon } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import {
  uploadProductImage,
  createProduct,
  updateProduct,
  deleteProduct,
} from "./actions";

export interface ProductFormOption {
  name: string;
  values: string[];
}

export interface ProductFormVariant {
  id?: string;
  options: Record<string, string>;
  title: string | null;
  sku: string | null;
  price: number;
  inventory: number;
  isActive: boolean;
}

export interface ProductFormData {
  id?: string;
  title: string;
  description: string;
  status: "active" | "draft" | "archived";
  options: ProductFormOption[];
  variants: ProductFormVariant[];
  imageUrls: string[];
  collectionIds: string[];
  marketplaceHidden?: boolean;
}

export interface CollectionOption {
  id: string;
  title: string;
}

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function ProductForm({
  initial,
  collections,
}: {
  initial: ProductFormData;
  collections: CollectionOption[];
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.admin.products;
  const isEdit = Boolean(initial.id);

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status);
  const [marketplaceHidden, setMarketplaceHidden] = useState(initial.marketplaceHidden ?? false);
  const [options, setOptions] = useState<ProductFormOption[]>(initial.options);
  const [variants, setVariants] = useState<ProductFormVariant[]>(initial.variants);
  const [images, setImages] = useState<string[]>(initial.imageUrls);
  const [collectionIds, setCollectionIds] = useState<string[]>(initial.collectionIds);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasOptions = options.length > 0 && options.some((o) => o.values.length > 0);

  // Regenerate the variant matrix from options, preserving any existing
  // price/stock/sku for combinations that survive.
  function regenerateMatrix(nextOptions: ProductFormOption[]) {
    const valid = nextOptions.filter((o) => o.name.trim() && o.values.length > 0);
    if (valid.length === 0) {
      // Fall back to a single default variant (keep its values if present).
      setVariants((prev) =>
        prev.length === 1 && Object.keys(prev[0]!.options).length === 0
          ? prev
          : [{ options: {}, title: null, sku: null, price: prev[0]?.price ?? 0, inventory: 0, isActive: true }],
      );
      return;
    }
    const combos = cartesian(valid);
    setVariants((prev) => {
      const byKey = new Map(prev.map((v) => [comboKey(v.options), v]));
      return combos.map((combo) => {
        const existing = byKey.get(comboKey(combo));
        return (
          existing ?? {
            options: combo,
            title: Object.values(combo).join(" / "),
            sku: null,
            price: prev[0]?.price ?? 0,
            inventory: 0,
            isActive: true,
          }
        );
      });
    });
  }

  function updateOption(index: number, patch: Partial<ProductFormOption>) {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    setOptions(next);
    regenerateMatrix(next);
  }

  function addOption() {
    if (options.length >= 3) return;
    setOptions([...options, { name: "", values: [] }]);
  }

  function removeOption(index: number) {
    const next = options.filter((_, i) => i !== index);
    setOptions(next);
    regenerateMatrix(next);
  }

  function setVariantField(index: number, patch: Partial<ProductFormVariant>) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function bulkPrice(price: number) {
    setVariants((prev) => prev.map((v) => ({ ...v, price })));
  }
  function bulkStock(inventory: number) {
    setVariants((prev) => prev.map((v) => ({ ...v, inventory })));
  }

  function toggleCollection(id: string) {
    setCollectionIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function submit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    if (initial.id) fd.set("productId", initial.id);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("status", status);
    fd.set("options", JSON.stringify(options.filter((o) => o.name.trim() && o.values.length > 0)));
    fd.set(
      "variants",
      JSON.stringify(
        variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          price: v.price,
          inventory: v.inventory,
          options: v.options,
          isActive: v.isActive,
        })),
      ),
    );
    fd.set("imageUrls", JSON.stringify(images));
    fd.set("collectionIds", JSON.stringify(collectionIds));
    fd.set("marketplaceHidden", marketplaceHidden ? "on" : "");

    startTransition(async () => {
      const action = isEdit ? updateProduct : createProduct;
      const result = await action(null, fd);
      // createProduct redirects on success (no result); updateProduct returns ok.
      if (result && !result.ok) setError(result.error ?? t.form.saveFailed);
      else if (result?.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function onDelete() {
    if (!initial.id) return;
    const fd = new FormData();
    fd.set("productId", initial.id);
    startTransition(() => {
      void deleteProduct(null, fd);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        {/* Basics */}
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-semibold text-ink">{t.form.name}</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-semibold text-ink">{t.form.description}</label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary"
            />
          </div>
        </section>

        {/* Images */}
        <ImageManager images={images} onChange={setImages} />

        {/* Options + variant matrix */}
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">{t.form.variants}</h2>
            {options.length < 3 && (
              <button type="button" onClick={addOption} className="text-xs font-semibold text-primary hover:underline">
                + {t.form.addOption}
              </button>
            )}
          </div>

          {options.map((opt, i) => (
            <OptionEditor
              key={i}
              option={opt}
              onChange={(patch) => updateOption(i, patch)}
              onRemove={() => removeOption(i)}
            />
          ))}

          {hasOptions && (
            <VariantMatrix
              variants={variants}
              onField={setVariantField}
              onBulkPrice={bulkPrice}
              onBulkStock={bulkStock}
            />
          )}

          {!hasOptions && (
            <SingleVariantFields
              variant={variants[0] ?? { options: {}, title: null, sku: null, price: 0, inventory: 0, isActive: true }}
              onField={(patch) => setVariantField(0, patch)}
            />
          )}
        </section>
      </div>

      {/* Aside */}
      <aside className="space-y-5">
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-semibold text-ink">{t.form.status}</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductFormData["status"])}
              className={inputCls}
            >
              <option value="active">{t.statusPills.active}</option>
              <option value="draft">{t.statusPills.draft}</option>
              <option value="archived">{t.statusPills.archived}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={marketplaceHidden}
              onChange={(e) => setMarketplaceHidden(e.target.checked)}
              className="h-4 w-4"
            />
            বাজার (মার্কেটপ্লেস) থেকে লুকান
          </label>
        </section>

        {collections.length > 0 && (
          <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-bold text-ink">{t.form.collections}</h2>
            <ul className="space-y-1.5">
              {collections.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={collectionIds.includes(c.id)}
                      onChange={() => toggleCollection(c.id)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    {c.title}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="space-y-2">
          {error && (
            <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
              {t.form.saved}
            </p>
          )}
          <Button onClick={submit} disabled={pending} fullWidth>
            {pending ? t.form.saving : isEdit ? t.form.saveProduct : t.form.createProduct}
          </Button>
          {isEdit && (
            <Button onClick={onDelete} variant="secondary" disabled={pending} fullWidth className="text-danger">
              {t.form.deleteProduct}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---- Sub-components ---------------------------------------------------------

function OptionEditor({
  option,
  onChange,
  onRemove,
}: {
  option: ProductFormOption;
  onChange: (patch: Partial<ProductFormOption>) => void;
  onRemove: () => void;
}) {
  const t = useDict().admin.products;
  const [valueDraft, setValueDraft] = useState("");

  function addValue() {
    const v = valueDraft.trim();
    if (!v || option.values.includes(v)) return;
    onChange({ values: [...option.values, v] });
    setValueDraft("");
  }

  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <input
          value={option.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t.form.optionNamePlaceholder}
          className="h-9 flex-1 rounded-sm border border-border-strong bg-surface px-2 text-sm text-ink"
        />
        <button type="button" onClick={onRemove} aria-label={t.form.removeOption} className="text-ink-subtle hover:text-danger">
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {option.values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-ink">
            {v}
            <button
              type="button"
              onClick={() => onChange({ values: option.values.filter((x) => x !== v) })}
              aria-label={`${v} ${t.form.removeValueSuffix}`}
              className="text-ink-subtle hover:text-danger"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={valueDraft}
          onChange={(e) => setValueDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue();
            }
          }}
          placeholder={t.form.valuePlaceholder}
          className="h-8 w-28 rounded-sm border border-border-strong bg-surface px-2 text-sm text-ink"
        />
      </div>
    </div>
  );
}

function VariantMatrix({
  variants,
  onField,
  onBulkPrice,
  onBulkStock,
}: {
  variants: ProductFormVariant[];
  onField: (index: number, patch: Partial<ProductFormVariant>) => void;
  onBulkPrice: (price: number) => void;
  onBulkStock: (stock: number) => void;
}) {
  const t = useDict().admin.products;
  const [bulkPriceVal, setBulkPriceVal] = useState("");
  const [bulkStockVal, setBulkStockVal] = useState("");

  return (
    <div className="space-y-2">
      {/* Bulk helpers */}
      <div className="flex flex-wrap gap-2 rounded-md bg-surface-2 p-2 text-sm">
        <span className="flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            value={bulkPriceVal}
            onChange={(e) => setBulkPriceVal(e.target.value)}
            placeholder={t.form.bulkPricePlaceholder}
            className="h-8 w-20 rounded-sm border border-border-strong bg-surface px-2 font-mono text-sm tnum"
          />
          <button
            type="button"
            onClick={() => onBulkPrice(Number(bulkPriceVal) || 0)}
            className="h-8 rounded-sm border border-border-strong bg-surface px-2 text-xs font-semibold text-ink hover:bg-surface"
          >
            {t.form.applyAllPrices}
          </button>
        </span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            value={bulkStockVal}
            onChange={(e) => setBulkStockVal(e.target.value)}
            placeholder={t.form.bulkStockPlaceholder}
            className="h-8 w-20 rounded-sm border border-border-strong bg-surface px-2 font-mono text-sm tnum"
          />
          <button
            type="button"
            onClick={() => onBulkStock(Number(bulkStockVal) || 0)}
            className="h-8 rounded-sm border border-border-strong bg-surface px-2 text-xs font-semibold text-ink"
          >
            {t.form.applyAllStock}
          </button>
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-ink-muted">
              <th className="py-2 pr-2">{t.form.variants}</th>
              <th className="py-2 pr-2">{t.form.price}</th>
              <th className="py-2 pr-2">{t.form.stock}</th>
              <th className="py-2 pr-2">{t.form.sku}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => (
              <tr key={comboKey(v.options) + i} className="border-b border-border">
                <td className="py-1.5 pr-2 text-ink">{Object.values(v.options).join(" / ") || "Default"}</td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={v.price}
                    onChange={(e) => onField(i, { price: Number(e.target.value) })}
                    className="h-8 w-24 rounded-sm border border-border-strong bg-surface px-2 text-right font-mono text-sm tnum"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={v.inventory}
                    onChange={(e) => onField(i, { inventory: Number(e.target.value) })}
                    className="h-8 w-20 rounded-sm border border-border-strong bg-surface px-2 text-right font-mono text-sm tnum"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    value={v.sku ?? ""}
                    onChange={(e) => onField(i, { sku: e.target.value || null })}
                    className="h-8 w-28 rounded-sm border border-border-strong bg-surface px-2 font-mono text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked list (never a horizontally-scrolling table for entry) */}
      <ul className="space-y-2 md:hidden">
        {variants.map((v, i) => (
          <li key={comboKey(v.options) + i} className="rounded-md border border-border p-2">
            <p className="mb-2 text-sm font-semibold text-ink">{Object.values(v.options).join(" / ") || "Default"}</p>
            <div className="grid grid-cols-2 gap-2">
              <LabeledInput label={t.form.price} value={v.price} onChange={(n) => onField(i, { price: n })} />
              <LabeledInput label={t.form.stock} value={v.inventory} onChange={(n) => onField(i, { inventory: n })} />
            </div>
            <input
              value={v.sku ?? ""}
              onChange={(e) => onField(i, { sku: e.target.value || null })}
              placeholder="SKU"
              className="mt-2 h-9 w-full rounded-sm border border-border-strong bg-surface px-2 font-mono text-sm"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SingleVariantFields({
  variant,
  onField,
}: {
  variant: ProductFormVariant;
  onField: (patch: Partial<ProductFormVariant>) => void;
}) {
  const t = useDict().admin.products;
  return (
    <div className="grid grid-cols-2 gap-3">
      <LabeledInput label={t.form.priceWithUnit} value={variant.price} onChange={(n) => onField({ price: n })} />
      <LabeledInput label={t.form.stock} value={variant.inventory} onChange={(n) => onField({ inventory: n })} />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-full rounded-sm border border-border-strong bg-surface px-2 text-right font-mono text-sm tnum"
      />
    </label>
  );
}

function ImageManager({
  images,
  onChange,
}: {
  images: string[];
  onChange: (urls: string[]) => void;
}) {
  const t = useDict().admin.products;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    const next = [...images];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      const result = await uploadProductImage(fd);
      if (result.ok && result.url) next.push(result.url);
      else setUploadError(result.error ?? t.form.uploadFailed);
    }
    onChange(next);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-bold text-ink">{t.form.images}</h2>
      <div className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border border-border">
            <img src={url} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-ink">
                {t.form.cover}
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t.form.moveLeft} className="text-xs text-white disabled:opacity-30">◀</button>
              <button type="button" onClick={() => remove(i)} aria-label={t.form.removeImage} className="text-white">
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label={t.form.moveRight} className="text-xs text-white disabled:opacity-30">▶</button>
            </div>
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-xs text-ink-muted hover:bg-surface-2">
          <PlusIcon className="h-5 w-5" />
          {uploading ? "..." : t.form.imageLabel}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onFiles(e.target.files)}
            className="hidden"
          />
        </label>
      </div>
      {uploadError && <p className="text-xs font-medium text-danger">{uploadError}</p>}
    </section>
  );
}

// ---- helpers ---------------------------------------------------------------
function cartesian(options: ProductFormOption[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (acc, opt) => {
      const next: Record<string, string>[] = [];
      for (const row of acc) {
        for (const value of opt.values) {
          next.push({ ...row, [opt.name]: value });
        }
      }
      return next;
    },
    [{}],
  );
}

function comboKey(options: Record<string, string>): string {
  return Object.entries(options)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}
