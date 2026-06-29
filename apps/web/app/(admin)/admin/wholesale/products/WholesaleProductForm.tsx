"use client";

// Wholesale product create/edit form. Bengali-first labels.
// Uses the same Tailwind + CSS class patterns as ProductForm.tsx.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { createWholesaleProduct, updateWholesaleProduct, deleteWholesaleProduct } from "./actions";

export interface WholesaleProductFormData {
  id?: string;
  title: string;
  description: string;
  status: "active" | "draft" | "archived";
  isWholesale: boolean;
  wholesaleOnly: boolean;
  moq: number;
  wholesalePrice: number;
  tierPrices: { minQty: number; price: number }[];
}

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function WholesaleProductForm({
  initial,
}: {
  initial: WholesaleProductFormData;
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.admin.wholesale.products.form;
  const isEdit = Boolean(initial.id);

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status);
  const [isWholesale, setIsWholesale] = useState(initial.isWholesale);
  const [wholesaleOnly, setWholesaleOnly] = useState(initial.wholesaleOnly);
  const [moq, setMoq] = useState(initial.moq);
  const [wholesalePrice, setWholesalePrice] = useState(initial.wholesalePrice);
  const [tierPrices, setTierPrices] = useState(initial.tierPrices);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function addTier() {
    setTierPrices([...tierPrices, { minQty: 0, price: 0 }]);
  }

  function updateTier(index: number, patch: Partial<{ minQty: number; price: number }>) {
    setTierPrices((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeTier(index: number) {
    setTierPrices((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    if (initial.id) fd.set("productId", initial.id);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("status", status);
    fd.set("isWholesale", isWholesale ? "on" : "");
    fd.set("wholesaleOnly", wholesaleOnly ? "on" : "");
    fd.set("moq", String(moq));
    fd.set("wholesalePrice", String(wholesalePrice));
    fd.set("tierPrices", JSON.stringify(tierPrices.filter((t) => t.minQty > 0)));

    startTransition(async () => {
      const action = isEdit ? updateWholesaleProduct : createWholesaleProduct;
      const result = await action(null, fd);
      if (result && !result.ok) setError(result.error ?? t.saveFailed);
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
      void deleteWholesaleProduct(null, fd);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        {/* Basics */}
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-semibold text-ink">{t.name}</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-semibold text-ink">{t.description}</label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary"
            />
          </div>
        </section>

        {/* Wholesale fields */}
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isWholesale}
                onChange={(e) => setIsWholesale(e.target.checked)}
                className="h-4 w-4"
              />
              {t.isWholesale}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={wholesaleOnly}
                onChange={(e) => setWholesaleOnly(e.target.checked)}
                className="h-4 w-4"
              />
              {t.wholesaleOnly}
            </label>
          </div>

          <div>
            <label htmlFor="moq" className="mb-1 block text-sm font-semibold text-ink">{t.moq}</label>
            <input
              id="moq"
              type="number"
              inputMode="numeric"
              value={moq}
              onChange={(e) => setMoq(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="wholesalePrice" className="mb-1 block text-sm font-semibold text-ink">{t.wholesalePrice}</label>
            <input
              id="wholesalePrice"
              type="number"
              inputMode="decimal"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          {/* Tier prices */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">{t.tierPrices}</h3>
              <button type="button" onClick={addTier} className="text-xs font-semibold text-primary hover:underline">
                + {t.addTier}
              </button>
            </div>
            {tierPrices.length === 0 && (
              <p className="mt-2 text-xs text-ink-muted">—</p>
            )}
            {tierPrices.map((tier, i) => (
              <div key={i} className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={tier.minQty}
                  onChange={(e) => updateTier(i, { minQty: Number(e.target.value) })}
                  placeholder={t.tierQty}
                  className="h-9 w-24 rounded-sm border border-border-strong bg-surface px-2 text-sm text-ink"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={tier.price}
                  onChange={(e) => updateTier(i, { price: Number(e.target.value) })}
                  placeholder={t.tierPrice}
                  className="h-9 w-24 rounded-sm border border-border-strong bg-surface px-2 text-sm text-ink"
                />
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  className="text-xs text-ink-subtle hover:text-danger"
                >
                  {t.removeTier}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Aside */}
      <aside className="space-y-5">
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-semibold text-ink">{d.admin.products.form.status}</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as WholesaleProductFormData["status"])}
              className={inputCls}
            >
              <option value="active">{d.admin.products.statusPills.active}</option>
              <option value="draft">{d.admin.products.statusPills.draft}</option>
              <option value="archived">{d.admin.products.statusPills.archived}</option>
            </select>
          </div>
        </section>

        <div className="space-y-2">
          {error && (
            <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
              {t.saved}
            </p>
          )}
          <Button onClick={submit} disabled={pending} fullWidth>
            {pending ? t.saving : isEdit ? t.saveProduct : t.createProduct}
          </Button>
          {isEdit && (
            <Button onClick={onDelete} variant="secondary" disabled={pending} fullWidth className="text-danger">
              {d.admin.products.form.deleteProduct}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
