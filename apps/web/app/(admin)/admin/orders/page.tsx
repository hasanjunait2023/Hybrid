import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { StatusBadge, PlusIcon } from "@hybrid/ui";
import { getActiveTenantId } from "@/lib/admin/data";
import { listOrders, getOrderStatusCounts } from "@/lib/admin/orders";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { OrderSearch } from "./OrderSearch";
import { OrdersBulkTable } from "./OrdersBulkTable";
import { EmptyOrders } from "@/components/admin/EmptyState";
import { PageHeader } from "../_ui";

// Orders list (DESIGN §P3.1). Triage-speed: status filter pills with counts,
// phone/order# search, stacked cards on mobile / table ≥ md, COD-pending money
// triage filter. Latin numerals + tabular-nums (§4.4).
interface OrdersPageProps {
  searchParams: Promise<{ status?: string; cod?: string; q?: string; payment?: string; source?: string }>;
}

// F-commerce channel filter (P3-3). order_source already carries 'messenger'.
const SOURCE_KEYS = ["all", "storefront", "manual", "messenger"] as const;

const STATUS_KEYS = [
  "all",
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
] as const;

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const codPending = sp.cod === "pending";
  const status = sp.status && sp.status !== "all" ? sp.status : undefined;
  const query = sp.q?.trim() || undefined;
  const source = sp.source && sp.source !== "all" ? sp.source : undefined;

  const [orders, counts] = await Promise.all([
    listOrders(tenantId, session.userId, {
      fulfillment: status,
      payment: sp.payment,
      query,
      codPending,
      source,
    }),
    getOrderStatusCounts(tenantId, session.userId),
  ]);

  const buildHref = (next: { status?: string; cod?: string }) => {
    const params = new URLSearchParams();
    if (next.cod === "pending") params.set("cod", "pending");
    else if (next.status && next.status !== "all") params.set("status", next.status);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  const activeKey = codPending ? "cod" : (status ?? "all");

  const { locale, d } = await getDict();
  const t = d.admin.orders;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(counts.all, locale)} ${d.admin.dashboard.ordersUnit} · ${formatNumber(counts.codPending, locale)} ${t.codDue}`}
        action={
          <a
            href="/admin/orders/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
          >
            <PlusIcon className="h-4 w-4" /> {d.admin.dashboard.newOrder}
          </a>
        }
      />

      <OrderSearch defaultValue={query ?? ""} />

      {/* Filter pills (sticky under top bar), horizontal-scroll with counts */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_KEYS.map((key) => {
          const count = key === "all" ? counts.all : (counts.byStatus[key] ?? 0);
          const active = activeKey === key;
          return (
            <Pill key={key} href={buildHref({ status: key })} active={active}>
              {t.statusPills[key]}
              <span className={active ? "opacity-90" : "text-ink-subtle"}>{formatNumber(count, locale)}</span>
            </Pill>
          );
        })}
        <Pill href={buildHref({ cod: "pending" })} active={activeKey === "cod"} tone="cod">
          {t.codDue}
          <span className={activeKey === "cod" ? "opacity-90" : "text-cod"}>
            {formatNumber(counts.codPending, locale)}
          </span>
        </Pill>
      </div>

      {/* Channel (source) filter — F-commerce visibility */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SOURCE_KEYS.map((key) => {
          const active = (source ?? "all") === key;
          const params = new URLSearchParams();
          if (key !== "all") params.set("source", key);
          if (status) params.set("status", status);
          if (query) params.set("q", query);
          const qs = params.toString();
          return (
            <Pill key={key} href={qs ? `/admin/orders?${qs}` : "/admin/orders"} active={active}>
              {t.source[key]}
            </Pill>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyOrders locale={locale} />
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <a
                  href={`/admin/orders/${o.id}`}
                  className="block overflow-hidden rounded-lg border border-border bg-surface shadow-xs"
                >
                  <div
                    className="border-l-[3px] p-3"
                    style={{ borderLeftColor: fulfillmentBar(o.fulfillmentStatus) }}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-sm font-bold text-ink tnum">
                        #{o.orderNumber}
                      </span>
                      <span className="text-2xs text-ink-subtle">{timeAgo(o.placedAt, locale)}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {o.customerName ?? "—"}
                        </p>
                        <p className="font-mono text-xs text-ink-muted tnum">{o.customerPhone}</p>
                      </div>
                      <span className="font-mono text-base font-bold text-ink tnum">
                        {formatMoney(o.grandTotal, locale)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StatusBadge kind="fulfillment" value={o.fulfillmentStatus} lang={locale} />
                      <StatusBadge kind="payment" value={o.paymentStatus} lang={locale} />
                      {o.codAmount > 0 && o.paymentStatus === "unpaid" && (
                        <StatusBadge kind="cod" value="pending" lang={locale} />
                      )}
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop: selectable table + bulk action bar */}
          <OrdersBulkTable orders={orders} />
        </>
      )}
    </div>
  );
}

function Pill({
  href,
  active,
  tone = "default",
  children,
}: {
  href: string;
  active: boolean;
  tone?: "default" | "cod";
  children: React.ReactNode;
}) {
  const base =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap";
  const cls = active
    ? tone === "cod"
      ? "bg-cod text-white"
      : "bg-primary text-ink-on-primary"
    : "border border-border bg-surface text-ink-muted hover:bg-surface-2";
  return (
    <a href={href} className={`${base} ${cls}`}>
      {children}
    </a>
  );
}

// 3px left-edge scan bar color per fulfillment status (CSS var values).
function fulfillmentBar(status: string): string {
  const map: Record<string, string> = {
    pending: "var(--color-st-pending)",
    confirmed: "var(--color-st-confirmed)",
    packed: "var(--color-st-packed)",
    shipped: "var(--color-st-shipped)",
    in_transit: "var(--color-st-shipped)",
    delivered: "var(--color-st-delivered)",
    returned: "var(--color-st-returned)",
    cancelled: "var(--color-st-cancelled)",
  };
  return map[status] ?? "var(--color-border)";
}
