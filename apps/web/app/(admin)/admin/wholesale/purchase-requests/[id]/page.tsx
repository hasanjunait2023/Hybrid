import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getPurchaseRequest } from "../actions";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { PageHeader, Breadcrumbs } from "../_ui";
import { QuoteForm } from "./QuoteForm";
import { AcceptRejectButtons } from "./AcceptRejectButtons";
import { ConvertToOrderButton } from "./ConvertToOrderButton";
import { StatusTimeline } from "./StatusTimeline";

// Purchase request detail page.
export default async function PurchaseRequestDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { id } = await props.params;
  const pr = await getPurchaseRequest(id);
  if (!pr) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          Purchase request not found.
        </p>
        <Link
          href="/admin/wholesale/purchase-requests"
          className="text-sm text-primary hover:underline"
        >
          ← Back to Purchase Requests
        </Link>
      </div>
    );
  }

  const { locale, d } = await getDict();
  const t = d.admin.wholesale.purchaseRequests;
  const dt = d.admin.wholesale.purchaseRequests.detail;

  const items = Array.isArray(pr.items) ? pr.items : [];

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: d.admin.wholesale.title, href: "/admin/wholesale" },
          { label: t.title, href: "/admin/wholesale/purchase-requests" },
          { label: `#${pr.prNumber}` },
        ]}
      />

      <PageHeader
        title={`${dt.title} #${pr.prNumber}`}
        subtitle={timeAgo(pr.createdAt, locale)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: buyer info + items */}
        <div className="space-y-6 lg:col-span-2">
          {/* Buyer Info */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{dt.buyerInfo}</h2>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-xs text-ink-muted">{d.admin.wholesale.customers.table.name}</span>
                <p className="font-medium text-ink">{pr.buyerName ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{d.admin.wholesale.customers.table.phone}</span>
                <p className="font-mono text-ink tnum">{pr.buyerPhone ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{d.admin.wholesale.customers.form.businessName}</span>
                <p className="text-ink">{pr.businessName ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{d.admin.wholesale.customers.form.tradeLicense}</span>
                <p className="font-mono text-ink tnum">{pr.tradeLicenseNo ?? "—"}</p>
              </div>
            </div>
          </section>

          {/* Items Table */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{dt.items}</h2>
            {items.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-muted">No items.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">Variant</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Requested Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: unknown, i: number) => {
                      const it = item as {
                        productId?: string;
                        variantId?: string;
                        title?: string;
                        variantTitle?: string;
                        quantity?: number;
                        price?: number;
                      };
                      return (
                        <tr key={it.variantId ?? i} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                          <td className="px-3 py-2 text-ink">{it.title ?? "—"}</td>
                          <td className="px-3 py-2 text-ink-muted">{it.variantTitle ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-mono text-ink tnum">{it.quantity ?? 0}</td>
                          <td className="px-3 py-2 text-right font-mono text-ink tnum">
                            {it.price != null ? formatMoney(it.price, locale) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right column: actions + timeline */}
        <div className="space-y-6">
          {/* Status badge */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-ink-muted">{t.table.status}</span>
            <p className="mt-1 text-lg font-bold text-ink">
              {t.statusLabels[pr.status as keyof typeof t.statusLabels] ?? pr.status}
            </p>
            {pr.quotedTotal != null && (
              <div className="mt-2">
                <span className="text-xs text-ink-muted">{t.table.quotedTotal}</span>
                <p className="font-mono text-lg font-bold text-ink tnum">
                  {formatMoney(pr.quotedTotal, locale)}
                </p>
              </div>
            )}
            {pr.expiresAt && (
              <div className="mt-2">
                <span className="text-xs text-ink-muted">{dt.expiresAt}</span>
                <p className="text-sm text-ink">{new Date(pr.expiresAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {/* Quote form (if status='submitted') */}
          {pr.status === "submitted" && <QuoteForm prId={pr.id} />}

          {/* Accept/Reject (if status='quoted') */}
          {pr.status === "quoted" && <AcceptRejectButtons prId={pr.id} />}

          {/* Convert to Order (if status='accepted') */}
          {pr.status === "accepted" && <ConvertToOrderButton prId={pr.id} />}

          {/* Status Timeline */}
          <StatusTimeline status={pr.status} createdAt={pr.createdAt} />
        </div>
      </div>
    </div>
  );
}
