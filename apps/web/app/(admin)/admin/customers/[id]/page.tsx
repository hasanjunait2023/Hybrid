import { notFound, redirect } from "next/navigation";
import { formatBdtLatin, StatusBadge, PhoneIcon, ChatIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCustomerDetail } from "@/lib/admin/customers";
import { timeAgoBn } from "@/lib/admin/format";
import { CustomerNotes } from "./CustomerNotes";

// Customer detail (DESIGN §P5). Header with trust signals (orders, spent, COD
// reliability = delivered vs returned), order history, addresses, notes/tags.
interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const customer = await getCustomerDetail(tenantId, session.userId, id);
  if (!customer) notFound();

  const returnRate =
    customer.deliveredCount + customer.returnedCount > 0
      ? customer.returnedCount / (customer.deliveredCount + customer.returnedCount)
      : 0;
  const riskyReturns = returnRate >= 0.3 && customer.returnedCount > 0;

  return (
    <div lang="en" className="space-y-5">
      <a href="/admin/customers" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← গ্রাহক তালিকা
      </a>

      {/* Header */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-weak text-lg font-bold text-primary">
            {(customer.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-ink">{customer.name ?? "—"}</h1>
            {customer.phone && (
              <div className="mt-1 flex items-center gap-3">
                <a
                  href={`tel:${customer.phone}`}
                  className="inline-flex items-center gap-1.5 font-mono text-sm text-primary tnum hover:underline"
                >
                  <PhoneIcon className="h-4 w-4" /> {customer.phone}
                </a>
                <a
                  href="https://m.me/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-subtle hover:text-primary"
                  aria-label="Messenger"
                >
                  <ChatIcon className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Trust signals */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
          <Stat label="অর্ডার" value={String(customer.ordersCount)} />
          <Stat label="মোট খরচ" value={formatBdtLatin(customer.totalSpent)} mono />
          <Stat
            label="ফেরত"
            value={`${customer.returnedCount}/${customer.deliveredCount + customer.returnedCount}`}
            tone={riskyReturns ? "danger" : "default"}
          />
        </div>
        {riskyReturns && (
          <p className="mt-2 rounded-md bg-danger-weak px-3 py-1.5 text-xs font-semibold text-danger">
            উচ্চ ফেরত হার — সতর্ক থাকুন (COD ঝুঁকি)।
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Order history */}
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-ink">অর্ডার ইতিহাস</h2>
          {customer.orders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">কোনো অর্ডার নেই।</p>
          ) : (
            <ul className="divide-y divide-border">
              {customer.orders.map((o) => (
                <li key={o.id}>
                  <a
                    href={`/admin/orders/${o.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="font-mono text-sm font-semibold text-ink tnum">#{o.orderNumber}</span>
                    <span className="flex-1 text-xs text-ink-subtle">{timeAgoBn(o.placedAt)}</span>
                    <span className="font-mono text-sm font-semibold text-ink tnum">
                      {formatBdtLatin(o.grandTotal)}
                    </span>
                    <StatusBadge kind="fulfillment" value={o.fulfillmentStatus} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Aside: addresses + notes */}
        <aside className="space-y-5">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">ঠিকানা</h2>
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-ink-muted">কোনো ঠিকানা নেই।</p>
            ) : (
              <ul className="space-y-3">
                {customer.addresses.map((a) => (
                  <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                    {a.isDefault && (
                      <span className="mb-1 inline-block rounded-full bg-primary-weak px-2 py-0.5 text-2xs font-semibold text-primary">
                        ডিফল্ট
                      </span>
                    )}
                    {a.recipient && <p className="font-medium text-ink">{a.recipient}</p>}
                    {a.phone && <p className="font-mono text-xs text-ink-muted tnum">{a.phone}</p>}
                    <p className="text-ink-muted">
                      {[a.line, a.thana, a.district, a.division].filter(Boolean).join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <CustomerNotes
            customerId={customer.id}
            initialNote={customer.note ?? ""}
            initialTags={customer.tags}
          />
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono = false,
  tone = "default",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <p className={`text-lg font-bold tnum ${tone === "danger" ? "text-danger" : "text-ink"} ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
      <p className="text-2xs text-ink-muted">{label}</p>
    </div>
  );
}
