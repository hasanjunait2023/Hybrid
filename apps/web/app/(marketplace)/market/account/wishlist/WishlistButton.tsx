"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWishlistAction, removeWishlistAction } from "./actions";

interface Props {
  productId: string;
  listingId: string;
  initialSaved: boolean;
}

export function WishlistButton({ productId, listingId, initialSaved }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = () => {
    startTransition(async () => {
      if (saved) {
        const res = await removeWishlistAction(productId);
        if (res.error === "needsLogin") { router.push("/login"); return; }
        if (res.ok) setSaved(false);
      } else {
        const res = await addWishlistAction(productId, listingId);
        if (res.error === "needsLogin") { router.push("/login"); return; }
        if (res.ok) setSaved(true);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={saved ? "উইশলিস্ট থেকে সরান" : "উইশলিস্টে যোগ করুন"}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-surface text-xl transition hover:bg-surface-2 disabled:opacity-50"
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
