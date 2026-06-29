import { redirect } from "next/navigation";
import { PlusIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listWholesaleProducts, getWholesaleProductStats } from "@/lib/admin/wholesale";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { PageHeader, StatStrip, StatCard } from "../../_ui";

// Wholesale product list — shows MOQ, wholesale price, tier pricing.
export default async function WholesaleProductsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [products, stats] = await Promise.all([
    listWholesaleProducts(tenantId, session.userId),
    getWholesaleProductStats(tenantId, session.userId),
  ]);

  const { locale, d } = await getDict();
  const t = d.admin.wholesale.products;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(stats.total, locale)} · ${formatNumber(stats.active, locale)} ${d.admin.products.subtitle.activeSuffix}`}
        action={
          <a
            href="/admin/wholesale/products/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
          >
            <PlusIcon className="h-4 w-4" /> {t.newProduct}
          </a>
        }
      />

      <StatStrip>
        <StatCard label={t.stats.total} value={formatNumber(stats.total, locale)} />
        <StatCard label={t.stats.active} value={formatNumber(stats.active, locale)} tone="success" />
      </StatStrip>

      {products.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {products.map((p) => (
              <li key={p.id}>
                <a
                  href={`/admin/wholesale/products/${p.id}/edit`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-xs"
                >
                  <Thumb url={p.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <StatusChip status={p.status} />
                      {p.wholesalePrice != null && (
                        <span className="font-mono text-xs text-ink-muted tnum">
                          {formatMoney(p.wholesalePrice, locale)}
                        </span>
                      )}
                    </div>
                    {p.moq != null && p.moq > 0 && (
                      <span className="text-2xs text-ink-subtle">MOQ: {formatNumber(p.moq, locale)}</span>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5 font-semibold">{t.table.product}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.status}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.price}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.wholesalePrice}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.moq}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.stock}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Thumb url={p.imageUrl} small />
                        <a
                          href={`/admin/wholesale/products/${p.id}/edit`}
                          className="font-medium text-ink hover:text-primary hover:underline"
                        >
                          {p.title}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><StatusChip status={p.status} /></td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-muted tnum">
                      {formatMoney(p.price, locale)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink tnum">
                      {p.wholesalePrice != null ? formatMoney(p.wholesalePrice, locale) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-muted tnum">
                      {p.moq != null && p.moq > 0 ? formatNumber(p.moq, locale) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-muted tnum">
                      {formatNumber(p.inventory, locale)}
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

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success-weak text-success",
    draft: "bg-st-pending-weak text-st-pending",
    archived: "bg-surface-2 text-ink-muted",
  };
  const cls = map[status] ?? "bg-surface-2 text-ink-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}
