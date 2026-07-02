import { notFound, redirect } from "next/navigation";
import { PhoneIcon, ChatIcon } from "@hybrid/ui";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getCustomer360 } from "@/lib/admin/customers";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { CustomerNotes } from "./CustomerNotes";
import { MonthlySpendChart, CommunicationLog, Customer360Timeline } from "./CustomerTimeline";
import { Breadcrumbs } from "../../_ui";

// Customer detail (DESIGN §P5). Header with trust signals (orders, spent, COD
// reliability = delivered vs returned), order history, addresses, notes/tags.
interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const customer = await getCustomer360(tenantId, session.userId, id);
  if (!customer) notFound();

  const returnRate =
    customer.deliveredCount + customer.returnedCount > 0
      ? customer.returnedCount / (customer.deliveredCount + customer.returnedCount)
      : 0;
  const riskyReturns = returnRate >= 0.3 && customer.returnedCount > 0;

  const { locale, d } = await getDict();
  const t = d.admin.customers.detail;

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: d.admin.nav.customers, href: "/admin/customers" },
          { label: customer.name ?? "—" },
        ]}
      />

      {/* Header */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-weak text-lg font-bold text-primary">
            {(customer.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{customer.name ?? "—"}</h1>
              <RfmBadge segment={customer.rfmSegment} labels={t.rfm} />
            </div>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {t.lastOrder}:{" "}
              {customer.lastOrderAt ? timeAgo(customer.lastOrderAt, locale) : t.never}
            </p>
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
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-center sm:grid-cols-4">
          <Stat label={t.statOrders} value={formatNumber(customer.ordersCount, locale)} />
          <Stat label={t.statSpent} value={formatMoney(customer.totalSpent, locale)} mono />
          <Stat label={t.statAov} value={formatMoney(customer.aov, locale)} mono />
          <Stat
            label={t.statReturns}
            value={`${formatNumber(customer.returnedCount, locale)}/${formatNumber(customer.deliveredCount + customer.returnedCount, locale)}`}
            tone={riskyReturns ? "danger" : "default"}
          />
        </div>
        {customer.ledgerBalance > 0 && (
          <p className="mt-2 flex items-center justify-between rounded-md bg-warning-weak px-3 py-1.5 text-xs font-semibold text-warning">
            <span>{t.dueLabel}</span>
            <span className="font-mono tnum">{formatMoney(customer.ledgerBalance, locale)}</span>
          </p>
        )}
        {riskyReturns && (
          <p className="mt-2 rounded-md bg-danger-weak px-3 py-1.5 text-xs font-semibold text-danger">
            {t.highReturnWarning}
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Unified activity timeline (Customer 360) */}
        <Customer360Timeline events={customer.timeline} locale={locale} labels={t.timeline} />

        {/* Aside: addresses + notes */}
        <aside className="space-y-5">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t.addresses}</h2>
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-ink-muted">{t.noAddresses}</p>
            ) : (
              <ul className="space-y-3">
                {customer.addresses.map((a) => (
                  <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                    {a.isDefault && (
                      <span className="mb-1 inline-block rounded-full bg-primary-weak px-2 py-0.5 text-2xs font-semibold text-primary">
                        {t.defaultBadge}
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

          {customer.monthlySpend && (
            <MonthlySpendChart data={customer.monthlySpend} locale={locale} />
          )}

          {customer.communications && (
            <CommunicationLog items={customer.communications} locale={locale} />
          )}
        </aside>
      </div>
    </div>
  );
}

// RFM-lite segment chip — the at-a-glance CRM signal (champion / loyal / at-risk
// …). Colour follows the health gradient: green good, amber watch, red lapsed.
function RfmBadge({
  segment,
  labels,
}: {
  segment: import("@/lib/admin/customers").RfmSegment;
  labels: Record<string, string>;
}) {
  const tone: Record<string, string> = {
    new: "bg-info-weak text-info",
    champion: "bg-success-weak text-success",
    loyal: "bg-success-weak text-success",
    active: "bg-primary-weak text-primary",
    at_risk: "bg-warning-weak text-warning",
    lost: "bg-danger-weak text-danger",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${tone[segment] ?? "bg-surface-2 text-ink-muted"}`}
    >
      {labels[segment] ?? segment}
    </span>
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
