"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBdtBangla } from "@hybrid/ui";
import { useMpCart } from "../../../cart/useMpCart";
import type { WholesaleProductDetail } from "@/lib/marketplace/wholesaleData";

// Wholesale add-to-cart island with MOQ enforcement.
// Only rendered for verified B2B buyers.
export function WholesaleAddToCart({
  product,
}: {
  product: WholesaleProductDetail;
}) {
  const cart = useMpCart();
  const router = useRouter();
  const [variantId, setVariantId] = useState(
    product.wholesaleVariants[0]?.id ?? "",
  );
  const variant = product.wholesaleVariants.find(
    (v) => v.id === variantId,
  ) ?? product.wholesaleVariants[0];
  const [quantity, setQuantity] = useState(
    Math.max(product.moq ?? variant?.moq ?? 1, 1),
  );
  const [added, setAdded] = useState(false);

  if (!variant) {
    return <p className="text-danger">এই পণ্য এখন অনুপলব্ধ।</p>;
  }

  const effectiveMoq = product.moq ?? variant.moq ?? 1;

  const onAdd = () => {
    if (quantity < effectiveMoq) return;
    // Use wholesale price if available, otherwise fall back to retail price
    const price = variant.wholesalePrice ?? variant.price;
    cart.add({
      tenantId: product.tenantId,
      variantId: variant.id,
      vendorSlug: product.vendorSlug,
      vendorName: product.vendorName,
      productSlug: product.productSlug,
      title: product.title,
      variantTitle: variant.title,
      price,
      imageUrl: product.imageUrl,
    }, quantity);
    setAdded(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Variant selector */}
      {product.wholesaleVariants.length > 1 ? (
        <select
          aria-label="ভ্যারিয়েন্ট"
          value={variantId}
          onChange={(e) => {
            setVariantId(e.target.value);
            setAdded(false);
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          {product.wholesaleVariants.map((v) => (
            <option key={v.id} value={v.id} disabled={!v.inStock}>
              {v.title ?? "ডিফল্ট"} —{" "}
              {v.wholesalePrice != null
                ? formatBdtBangla(v.wholesalePrice)
                : formatBdtBangla(v.price)}
              {!v.inStock ? " (স্টক নেই)" : ""}
            </option>
          ))}
        </select>
      ) : null}

      {/* Quantity selector with MOQ enforcement */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-ink-muted">পরিমাণ:</label>
        <div className="flex items-center rounded-md border border-border">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(effectiveMoq, quantity - 1))}
            disabled={quantity <= effectiveMoq}
            className="px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-30"
            aria-label="পরিমাণ কমান"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-sm font-medium">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            className="px-3 py-2 text-sm hover:bg-surface-2"
            aria-label="পরিমাণ বাড়ান"
          >
            +
          </button>
        </div>
        {effectiveMoq > 1 && (
          <span className="text-xs text-ink-muted">
            সর্বনিম্ন {effectiveMoq} পিস
          </span>
        )}
      </div>

      {/* Add to cart button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={!variant.inStock || quantity < effectiveMoq}
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
