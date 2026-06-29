import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { withTenant } from "@hybrid/db";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { PageHeader, Breadcrumbs } from "../../_ui";

// Wholesale order detail page.
export default async function WholesaleOrderDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { id } = await props.params;

  const order = await withTenant(tenantId, session.userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        order_number: string;
        customer_id: string;
        customer_name: string | null;
        customer_phone: string | null;
        subtotal: string;
        grand_total: string;
        payment_status: string;
        fulfillment_status: string;
        po_reference: string | null;
        credit_approved: boolean;
        credit_due: string;
        credit_terms: string | null;
        placed_at: string;
        note: string | null;
        shipping_address: unknown;
      }[]
    >`
      select id, order_number, customer_id, customer_name, customer_phone,
             subtotal, grand_total, payment_status, fulfillment_status,
             po_reference, credit_approved, credit_due, credit_terms,
             placed_at, note, shipping_address
      from orders
      where id = ${id}
        and tenant_id = ${tenantId}
        and order_mode = 'wholesale'
      limit 1
    `;
    if (!rows[0]) return null;

    const items = await tx<
      {
        title: string;
        sku: string | null;
        unit_price: string;
        quantity: number;
        line_total: string;
      }[]
    >`
      select title, sku, unit_price, quantity, line_total
      from order_item
      where order_id = ${id}
        and tenant_id = ${tenantId}
      order by id
    `;

    return { ...rows[0], items };
  });

  if (!order) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          Order not found.
        </p>
        <Link
          href="/admin/wholesale/orders"
          className="text-sm text-primary hover:underline"
        >
          ← Back to Orders
        </Link>
      </div>
    );
  }

  const { locale, d } = await getDict();
  const t = d.admin.wholesale.orders;
  const dt = t.detail;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: d.admin.wholesale.title, href: "/admin/wholesale" },
          { label: t.title, href: "/admin/wholesale/orders" },
          { label: `#${order.order_number}` },
        ]}
      />

      <PageHeader
        title={`${dt.title} #${order.order_number}`}
        subtitle={timeAgo(order.placed_at, locale)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Order Info */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{dt.orderInfo}</h2>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-xs text-ink-muted">{t.table.order}</span>
                <p className="font-mono font-medium text-ink tnum">#{order.order_number}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{dt.poReference}</span>
                <p className="font-mono text-ink tnum">{order.po_reference ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{dt.creditApproved}</span>
                <p className={order.credit_approved ? "text-success" : "text-ink-muted"}>
                  {order.credit_approved ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{dt.creditDue}</span>
                <p className="font-mono text-ink tnum">
                  {order.credit_due ? formatMoney(Number(order.credit_due), locale) : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{dt.creditTerms}</span>
                <p className="text-ink">{order.credit_terms ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{t.table.status}</span>
                <p className="text-ink">{order.fulfillment_status}</p>
              </div>
            </div>
          </section>

          {/* Customer Info */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{dt.customerInfo}</h2>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-xs text-ink-muted">{d.admin.wholesale.customers.table.name}</span>
                <p className="font-medium text-ink">{order.customer_name ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{d.admin.wholesale.customers.table.phone}</span>
                <p className="font-mono text-ink tnum">{order.customer_phone ?? "—"}</p>
              </div>
            </div>
          </section>

          {/* Items */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{dt.items}</h2>
            {order.items.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-muted">No items.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">SKU</th>
                      <th className="px-3 py-2 text-right font-semibold">Price</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, i) => (
                      <tr key={i} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                        <td className="px-3 py-2 text-ink">{item.title}</td>
                        <td className="px-3 py-2 font-mono text-xs text-ink-muted tnum">
                          {item.sku ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink tnum">
                          {formatMoney(Number(item.unit_price), locale)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink tnum">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-ink tnum">
                          {formatMoney(Number(item.line_total), locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong">
                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">
                        {t.table.total}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-ink tnum">
                        {formatMoney(Number(order.grand_total), locale)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Payment Status */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{dt.paymentStatus}</h2>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-ink-muted">Status</span>
                <p className="text-lg font-bold text-ink">{order.payment_status}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">{t.table.total}</span>
                <p className="font-mono text-lg font-bold text-ink tnum">
                  {formatMoney(Number(order.grand_total), locale)}
                </p>
              </div>
            </div>
          </section>

          {/* Credit Ledger Link */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{dt.creditLedger}</h2>
            <Link
              href={`/admin/wholesale/ledger?customerId=${order.customer_id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {dt.creditLedger} →
            </Link>
          </section>

          {order.note && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <span className="text-xs text-ink-muted">Note</span>
              <p className="mt-1 text-sm text-ink">{order.note}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
