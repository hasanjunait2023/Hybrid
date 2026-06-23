"use client";

// Product search box (DESIGN §P4). URL-as-state; preserves the active status
// filter. Trigram-backed title search (product_title_trgm_idx).
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "@hybrid/ui";

export function ProductSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(defaultValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    const qs = next.toString();
    router.push(qs ? `/admin/products?${qs}` : "/admin/products");
  }

  return (
    <form onSubmit={submit} className="relative" role="search">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="পণ্যের নাম দিয়ে খুঁজুন"
        aria-label="পণ্য খুঁজুন"
        className="h-11 w-full rounded-md border border-border-strong bg-surface pl-10 pr-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary"
      />
    </form>
  );
}
