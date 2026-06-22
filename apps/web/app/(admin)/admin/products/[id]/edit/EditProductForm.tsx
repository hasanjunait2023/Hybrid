"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@hybrid/ui";
import { updateProduct, type ActionResult } from "./actions";
import type { AdminProductDetail } from "@/lib/admin/data";

interface EditProductFormProps {
  product: AdminProductDetail;
}

const inputClass =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

// Admin edit form (DESIGN §7.3 inputs, calm density). Uncontrolled inputs +
// Server Action via useActionState; the action revalidates the storefront tags
// so "admin edit → storefront update" closes the loop (the P0 thesis).
export function EditProductForm({ product }: EditProductFormProps) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateProduct,
    null,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-5" lang="en">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="variantId" value={product.variantId} />

      <Field label="নাম" htmlFor="title">
        <input
          id="title"
          name="title"
          defaultValue={product.title}
          required
          maxLength={200}
          className={inputClass}
        />
      </Field>

      <Field label="বিবরণ" htmlFor="description">
        <textarea
          id="description"
          name="description"
          defaultValue={product.description ?? ""}
          rows={4}
          maxLength={5000}
          className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="দাম (৳)" htmlFor="price">
          <input
            id="price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={product.price}
            required
            className={`${inputClass} font-mono tnum`}
          />
        </Field>
        <Field label="স্টক" htmlFor="inventory">
          <input
            id="inventory"
            name="inventory"
            type="number"
            min={0}
            step={1}
            defaultValue={product.inventory}
            required
            className={`${inputClass} font-mono tnum`}
          />
        </Field>
      </div>

      <Field label="স্ট্যাটাস" htmlFor="status">
        <select
          id="status"
          name="status"
          defaultValue={product.status}
          className={inputClass}
        >
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </Field>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p
          role="status"
          className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success"
        >
          সেভ হয়েছে।
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <a href="/admin/products">
          <Button variant="secondary">বাতিল</Button>
        </a>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "সেভ হচ্ছে…" : "সেভ করুন"}
    </Button>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}
