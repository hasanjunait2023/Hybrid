import Link from "next/link";
import { listMarketplaceProducts, type MpSort } from "@/lib/marketplace/data";
import { ProductGrid } from "../ProductGrid";

const SORTS: { value: MpSort; label: string }[] = [
  { value: "relevance", label: "প্রাসঙ্গিক" },
  { value: "newest", label: "নতুন" },
  { value: "price_asc", label: "দাম ↑" },
  { value: "price_desc", label: "দাম ↓" },
  { value: "rating", label: "রেটিং" },
];

const PAGE_SIZE = 24;

function parseSort(raw: string | undefined): MpSort {
  return SORTS.some((s) => s.value === raw) ? (raw as MpSort) : "relevance";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const sort = parseSort(sp.sort);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const result = query
    ? await listMarketplaceProducts({ q: query, sort, page, pageSize: PAGE_SIZE })
    : null;

  // Build a /search href preserving the query, with an overridden sort/page.
  const hrefWith = (next: { sort?: MpSort; page?: number }): string => {
    const params = new URLSearchParams({ q: query, sort: next.sort ?? sort });
    const p = next.page ?? page;
    if (p > 1) params.set("page", String(p));
    return `/search?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {query ? `"${query}" — ফলাফল` : "অনুসন্ধান করুন"}
      </h1>

      {query && result ? (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="সাজান">
            <span className="text-sm text-ink-muted">সাজান:</span>
            {SORTS.map((s) => (
              <Link
                key={s.value}
                href={hrefWith({ sort: s.value, page: 1 })}
                aria-current={s.value === sort ? "true" : undefined}
                className={
                  s.value === sort
                    ? "rounded-full bg-primary px-3 py-1 text-sm text-ink-on-primary"
                    : "rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-primary"
                }
              >
                {s.label}
              </Link>
            ))}
          </div>

          {result.items.length > 0 ? (
            <ProductGrid products={result.items} />
          ) : (
            <p className="text-sm text-ink-muted">কোনো পণ্য পাওয়া যায়নি।</p>
          )}

          {(page > 1 || result.hasMore) && (
            <nav className="flex items-center justify-between gap-3" aria-label="পেজিনেশন">
              {page > 1 ? (
                <Link
                  href={hrefWith({ page: page - 1 })}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary"
                >
                  ← আগের
                </Link>
              ) : (
                <span />
              )}
              {result.hasMore ? (
                <Link
                  href={hrefWith({ page: page + 1 })}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary"
                >
                  পরের →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : null}
    </div>
  );
}
