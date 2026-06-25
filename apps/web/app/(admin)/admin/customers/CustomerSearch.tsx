"use client";

// Customer search + sort (DESIGN §P5). URL-as-state.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";

export function CustomerSearch({
  defaultValue,
  sort,
}: {
  defaultValue: string;
  sort: "recent" | "spend";
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.admin.customers.search;
  const [value, setValue] = useState(defaultValue);

  function push(nextSort: "recent" | "spend", q: string) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (nextSort === "spend") params.set("sort", "spend");
    const qs = params.toString();
    router.push(qs ? `/admin/customers?${qs}` : "/admin/customers");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          push(sort, value);
        }}
        role="search"
        className="relative min-w-0 flex-1"
      >
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
        <input
          type="search"
          inputMode="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.placeholder}
          aria-label={t.aria}
          className="h-11 w-full rounded-md border border-border-strong bg-surface pl-10 pr-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary"
        />
      </form>
      <div className="flex rounded-md border border-border bg-surface p-0.5 text-xs font-semibold">
        <button
          type="button"
          onClick={() => push("recent", value)}
          className={`rounded px-3 py-1.5 ${sort === "recent" ? "bg-primary text-ink-on-primary" : "text-ink-muted"}`}
        >
          {t.recent}
        </button>
        <button
          type="button"
          onClick={() => push("spend", value)}
          className={`rounded px-3 py-1.5 ${sort === "spend" ? "bg-primary text-ink-on-primary" : "text-ink-muted"}`}
        >
          {t.spend}
        </button>
      </div>
    </div>
  );
}
