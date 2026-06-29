"use client";
// Post-checkout upsell client island. Shows the special offer and handles the
// one-click accept / decline. On accept, calls the server action to place a new
// order; on decline, redirects to the original order confirmation page.
import { useState } from "react";
import { acceptUpsellAction } from "../actions";
import { formatMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

interface UpsellClientProps {
  tenantSlug: string;
  lpSlug: string;
  originalOrderNumber: number;
  phone: string;
  upsell: {
    title: string;
    price: number;
    image_url?: string;
    description?: string;
  };
  locale: Locale;
}

export function UpsellClient({
  tenantSlug,
  lpSlug,
  originalOrderNumber,
  phone,
  upsell,
  locale,
}: UpsellClientProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleAccept() {
    setState("loading");
    const result = await acceptUpsellAction({
      tenantSlug,
      lpSlug,
      originalOrderNumber,
      phone,
    });
    if (!result.ok) {
      setErrorMsg(result.error);
      setState("error");
      return;
    }
    setState("done");
    window.location.href = `/order/${result.orderNumber}?phone=${encodeURIComponent(phone)}`;
  }

  function handleDecline() {
    window.location.href = `/order/${originalOrderNumber}?phone=${encodeURIComponent(phone)}`;
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-8 text-center">
      <div className="mb-6 rounded-lg border-2 border-primary bg-primary/5 p-1">
        <p className="rounded-t-md bg-primary px-3 py-1.5 text-xs font-bold text-white">
          বিশেষ একবারের অফার!
        </p>
        <div className="p-4">
          {upsell.image_url && (
            <img
              src={upsell.image_url}
              alt={upsell.title}
              className="mx-auto mb-3 max-h-48 rounded-lg object-contain"
            />
          )}
          <h2 className="text-lg font-bold text-ink">{upsell.title}</h2>
          {upsell.description && (
            <p className="mt-1 text-sm text-ink-muted">{upsell.description}</p>
          )}
          <p className="mt-3 text-2xl font-bold text-primary">
            {formatMoney(upsell.price, locale)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">আপনার সাথেই ডেলিভারি হবে — আলাদা শিপিং নেই!</p>
        </div>
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">{errorMsg}</p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleAccept}
          disabled={state === "loading" || state === "done"}
          className="w-full rounded-lg bg-primary py-4 text-base font-bold text-white shadow-md hover:bg-primary-hover disabled:opacity-60"
        >
          {state === "loading" ? "অপেক্ষা করুন..." : "✓ হ্যাঁ! এই অফারটি নিন"}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={state === "loading" || state === "done"}
          className="w-full py-3 text-sm text-ink-muted underline hover:text-ink"
        >
          না ধন্যবাদ, এই অফার চাই না
        </button>
      </div>
    </div>
  );
}
