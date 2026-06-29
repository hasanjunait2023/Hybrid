"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moderateMarketplaceReview } from "./actions";

export function ModerateButtons({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (approve: boolean) => {
    setBusy(true);
    await moderateMarketplaceReview(reviewId, approve);
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => act(true)}
        className="rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-hover disabled:opacity-50"
      >
        অনুমোদন
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act(false)}
        className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
      >
        বাতিল
      </button>
    </div>
  );
}
