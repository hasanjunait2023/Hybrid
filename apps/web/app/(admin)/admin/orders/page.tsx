import { redirect } from "next/navigation";
import { formatBdtLatin, StatusBadge, PlusIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listOrders, getOrderStatusCounts } from "@/lib/admin/orders";
import { timeAgoBn } from "@/lib/admin/format";
import { OrderSearch } from "./OrderSearch";
import { PageHeader } from "../_ui";

// Orders list (DESIGN §P3.1). Triage-speed: status filter pills with counts,
// phone/order# search, stacked cards on mobile / table ≥ md, COD-pending money
// triage filter. Latin numerals + tabular-nums (§4.4).
interface OrdersPageProps {
  searchParams: Promise<{ status?: string; cod?: string; q?: string; payment?: string }>;
}

const STATUS_PILLS: { value: string; bn: string }[] = [
  { value: "all", bn: "সব" },
  { value: "pending", bn: "অপেক্ষমাণ" },
  { value: "confirmed", bn: "নিশ্চিত" },
  { value: "packed", bn: "প্যাকড" },
  { value: "shipped", bn: "পাঠানো" },
  { value: "delivered", bn: "ডেলিভার্ড" },
  { value: "returned", bn: "ফেরত" },
  { value: "cancelled", bn: "বাতিল" },
];

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const codPending = sp.cod === "pending";
  const status = sp.status && sp.status !== "all" ? sp.status : undefined;
  const query = sp.q?.trim() || undefined;

  const [orders, counts] = await Promise.all([
    listOrders(tenantId, session.userId, {
      fulfillment: status,
      payment: sp.payment,
      query,
      codPending,
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

  return (
    <div lang="en" className="space-y-4">
      <PageHeader
        title="অর্ডার"
        subtitle={`${counts.all} টি অর্ডার · ${counts.codPending} COD বকেয়া`}
        action={
          <a
            href="/admin/orders/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
          >
            <PlusIcon className="h-4 w-4" /> নতুন অর্ডার
          </a>
        }
      />

      <OrderSearch defaultValue={query ?? ""} />

      {/* Filter pills (sticky under top bar), horizontal-scroll with counts */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_PILLS.map((pill) => {
          const count =
            pill.value === "all" ? counts.all : (counts.byStatus[pill.value] ?? 0);
          const active = activeKey === pill.value;
          return (
            <Pill key={pill.value} href={buildHref({ status: pill.value })} active={active}>
              {pill.bn}
              <span className={active ? "opacity-90" : "text-ink-subtle"}>{count}</span>
            </Pill>
          );
        })}
        <Pill href={buildHref({ cod: "pending" })} active={activeKey === "cod"} tone="cod">
          COD বকেয়া
          <span className={activeKey === "cod" ? "opacity-90" : "text-cod"}>
            {counts.codPending}
          </span>
        </Pill>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          কোনো অর্ডার নেই।
        </p>
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
                      <span className="text-2xs text-ink-subtle">{timeAgoBn(o.placedAt)}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {o.customerName ?? "—"}
                        </p>
                        <p className="font-mono text-xs text-ink-muted tnum">{o.customerPhone}</p>
                      </div>
                      <span className="font-mono text-base font-bold text-ink tnum">
                        {formatBdtLatin(o.grandTotal)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StatusBadge kind="fulfillment" value={o.fulfillmentStatus} />
                      <StatusBadge kind="payment" value={o.paymentStatus} />
                      {o.codAmount > 0 && o.paymentStatus === "unpaid" && (
                        <StatusBadge kind="cod" value="pending" />
                      )}
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2.5 font-semibold">Order#</th>
                  <th className="px-3 py-2.5 font-semibold">গ্রাহক</th>
                  <th className="px-3 py-2.5 text-right font-semibold">মোট</th>
                  <th className="px-3 py-2.5 font-semibold">ফুলফিলমেন্ট</th>
                  <th className="px-3 py-2.5 font-semibold">পেমেন্ট</th>
                  <th className="px-3 py-2.5 font-semibold">তারিখ</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr
                    key={o.id}
                    className={i % 2 === 1 ? "bg-surface-2" : undefined}
                  >
                    <td className="px-3 py-2.5">
                      <a
                        href={`/admin/orders/${o.id}`}
                        className="font-mono font-semibold text-ink hover:text-primary hover:underline tnum"
                      >
                        #{o.orderNumber}
                      </a>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-ink">{o.customerName ?? "—"}</div>
                      <div className="font-mono text-xs text-ink-muted tnum">{o.customerPhone}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink tnum">
                      {formatBdtLatin(o.grandTotal)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge kind="fulfillment" value={o.fulfillmentStatus} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge kind="payment" value={o.paymentStatus} />
                        {o.codAmount > 0 && o.paymentStatus === "unpaid" && (
                          <StatusBadge kind="cod" value="pending" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{timeAgoBn(o.placedAt)}</td>
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
