"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBdtBangla } from "@hybrid/ui";
import { useMpCart } from "../../cart/useMpCart";
import type { MpProductDetail } from "@/lib/marketplace/data";

// PDP add-to-cart island. Picks a variant, adds to the cross-vendor cart.
export function AddToCart({ product }: { product: MpProductDetail }) {
  const cart = useMpCart();
  const router = useRouter();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const [added, setAdded] = useState(false);

  if (!variant) return <p className="text-danger">এই পণ্য এখন অনুপলব্ধ।</p>;

  const onAdd = () => {
    cart.add({
      tenantId: product.tenantId,
      variantId: variant.id,
      vendorSlug: product.vendorSlug,
      vendorName: product.vendorName,
      productSlug: product.productSlug,
      title: product.title,
      variantTitle: variant.title,
      price: variant.price,
      imageUrl: product.imageUrl,
    });
    setAdded(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {product.variants.length > 1 ? (
        <select
          aria-label="ভ্যারিয়েন্ট"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          {product.variants.map((v) => (
            <option key={v.id} value={v.id} disabled={!v.inStock}>
              {v.title ?? "ডিফল্ট"} — {formatBdtBangla(v.price)}
              {!v.inStock ? " (স্টক নেই)" : ""}
            </option>
          ))}
        </select>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={!variant.inStock}
          className="min-h-[44px] flex-1 rounded-md bg-primary px-4 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {variant.inStock ? "কার্টে যোগ করুন" : "স্টক নেই"}
        </button>
        {added ? (
          <button
            type="button"
            onClick={() => router.push("/cart")}
            className="min-h-[44px] rounded-md border border-primary px-4 font-medium text-primary"
          >
            কার্ট দেখুন
          </button>
        ) : null}
      </div>
    </div>
  );
}
