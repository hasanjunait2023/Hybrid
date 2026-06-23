import { redirect } from "next/navigation";
import { formatBdtLatin, PlusIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listProducts } from "@/lib/admin/catalog";
import { LOW_STOCK_THRESHOLD } from "@/lib/admin/dashboard";
import { ProductSearch } from "./ProductSearch";

// Admin product list (DESIGN §P4). Status filter pills + title search (trigram),
// thumbnail, status chip, price (mono), total inventory (warning if low, danger
// if 0). Stacked cards on mobile / table ≥ md. Latin numerals + tabular-nums.
interface ProductsPageProps {
  searchParams: Promise<{ status?: string; q?: string }>;
}

const STATUS_PILLS = [
  { value: "all", bn: "সব" },
  { value: "active", bn: "অ্যাকটিভ" },
  { value: "draft", bn: "ড্রাফট" },
  { value: "archived", bn: "আর্কাইভড" },
] as const;

export default async function AdminProductsPage({ searchParams }: ProductsPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const status = (sp.status as "all" | "active" | "draft" | "archived") || "all";
  const query = sp.q?.trim() || undefined;

  const products = await listProducts(tenantId, session.userId, { status, query });

  const buildHref = (s: string) => {
    const params = new URLSearchParams();
    if (s !== "all") params.set("status", s);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  };

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">পণ্য</h1>
        <a
          href="/admin/products/new"
          className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
        >
          <PlusIcon className="h-4 w-4" /> নতুন পণ্য
        </a>
      </div>

      <ProductSearch defaultValue={query ?? ""} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_PILLS.map((pill) => {
          const active = status === pill.value;
          return (
            <a
              key={pill.value}
              href={buildHref(pill.value)}
              className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                active
                  ? "bg-primary text-ink-on-primary"
                  : "border border-border bg-surface text-ink-muted hover:bg-surface-2"
              }`}
            >
              {pill.bn}
            </a>
          );
        })}
        <a href="/admin/collections" className="ml-auto inline-flex shrink-0 items-center text-xs font-semibold text-primary hover:underline">
          কালেকশন →
        </a>
      </div>

      {products.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          কোনো পণ্য নেই।
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {products.map((p) => (
              <li key={p.id}>
                <a
                  href={`/admin/products/${p.id}/edit`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <Thumb url={p.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <StatusChip status={p.status} />
                      <span className="font-mono text-xs text-ink-muted tnum">
                        {formatBdtLatin(p.price)}
                      </span>
                    </div>
                  </div>
                  <span className={`font-mono text-sm font-semibold tnum ${stockTone(p.inventory)}`}>
                    {p.inventory}
                  </span>
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5 font-semibold">পণ্য</th>
                  <th className="px-4 py-2.5 font-semibold">স্ট্যাটাস</th>
                  <th className="px-4 py-2.5 text-right font-semibold">দাম</th>
                  <th className="px-4 py-2.5 text-right font-semibold">স্টক</th>
                  <th className="px-4 py-2.5 text-right font-semibold">ভ্যারিয়েন্ট</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Thumb url={p.imageUrl} small />
                        <a
                          href={`/admin/products/${p.id}/edit`}
                          className="font-medium text-ink hover:text-primary hover:underline"
                        >
                          {p.title}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><StatusChip status={p.status} /></td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink tnum">
                      {formatBdtLatin(p.price)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono tnum ${stockTone(p.inventory)}`}>
                      {p.inventory}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-muted tnum">
                      {p.variantCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Thumb({ url, small = false }: { url: string | null; small?: boolean }) {
  const size = small ? "h-9 w-9" : "h-12 w-12";
  if (!url) {
    return <div className={`${size} shrink-0 rounded-md bg-surface-2`} aria-hidden />;
  }
  return <img src={url} alt="" className={`${size} shrink-0 rounded-md object-cover`} />;
}

function stockTone(inventory: number): string {
  if (inventory <= 0) return "text-danger";
  if (inventory <= LOW_STOCK_THRESHOLD) return "text-warning";
  return "text-ink-muted";
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    active: { tone: "bg-success-weak text-success", label: "Active" },
    draft: { tone: "bg-st-pending-weak text-st-pending", label: "Draft" },
    archived: { tone: "bg-surface-2 text-ink-muted", label: "Archived" },
  };
  const s = map[status] ?? { tone: "bg-surface-2 text-ink-muted", label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${s.tone}`}>
      {s.label}
    </span>
  );
}
