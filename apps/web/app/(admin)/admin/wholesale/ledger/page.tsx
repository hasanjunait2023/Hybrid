import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { listLedgerEntries, listB2BCustomers } from "@/lib/admin/wholesale";
import { timeAgo } from "@/lib/admin/format";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { PageHeader } from "../../_ui";
import { CustomerSelector } from "./CustomerSelector";
import { LedgerClient } from "./LedgerClient";

// Customer credit ledger view with customer selection, running balance,
// credit limit progress bar, and inline payment/credit-note forms.
export default async function WholesaleLedgerPage(props: {
  searchParams?: Promise<{ customerId?: string }>;
}) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const searchParams = await props.searchParams;
  const selectedCustomerId = searchParams?.customerId;

  const [customers, entries] = await Promise.all([
    listB2BCustomers(tenantId, session.userId),
    selectedCustomerId
      ? listLedgerEntries(tenantId, session.userId, selectedCustomerId)
      : Promise.resolve([]),
  ]);

  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId)
    : null;

  const { locale, d } = await getDict();
  const t = d.admin.wholesale.ledger;

  // Compute running balance
  let _runningBalance = 0;
  const entriesWithBalance = entries.map((e) => {
    _runningBalance = e.balance;
    return e;
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} />

      {/* Customer selector */}
      <CustomerSelector
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          businessName: c.businessName,
        }))}
        selectedCustomerId={selectedCustomerId}
        label={t.allCustomers ?? "Select Customer"}
        placeholder={t.allCustomers ?? "All Customers"}
      />

      {selectedCustomer && (
        <>
          {/* Credit limit progress bar */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-ink-muted">
                {d.admin.wholesale.customers.table.creditLimit}
              </span>
              <span className="font-mono text-sm font-bold text-ink tnum">
                {formatMoney(selectedCustomer.currentDue, locale)} / {formatMoney(selectedCustomer.creditLimit, locale)}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full transition-all ${
                  selectedCustomer.creditLimit > 0
                    ? selectedCustomer.currentDue / selectedCustomer.creditLimit > 0.8
                      ? "bg-danger"
                      : selectedCustomer.currentDue / selectedCustomer.creditLimit > 0.5
                        ? "bg-warning"
                        : "bg-success"
                    : "bg-success"
                }`}
                style={{
                  width: `${
                    selectedCustomer.creditLimit > 0
                      ? Math.min(
                          (selectedCustomer.currentDue / selectedCustomer.creditLimit) * 100,
                          100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-2xs text-ink-muted">
              <span>{d.admin.wholesale.customers.table.currentDue}</span>
              <span>{d.admin.wholesale.customers.table.creditLimit}</span>
            </div>
          </div>

          {/* Inline forms */}
          <LedgerClient customerId={selectedCustomerId!} />
        </>
      )}

      {/* Ledger entries */}
      {entriesWithBalance.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {selectedCustomerId ? "No ledger entries for this customer." : t.empty}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {entriesWithBalance.map((e) => (
              <li key={e.id}>
                <div className="rounded-lg border border-border bg-surface p-3 shadow-xs">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">{e.customerName ?? "—"}</span>
                    <span
                      className={`font-mono text-sm font-bold tnum ${
                        e.type === "payment" || e.type === "credit_note"
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {e.type === "payment" || e.type === "credit_note" ? "-" : "+"}
                      {formatMoney(Math.abs(e.amount), locale)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-xs text-ink-muted">
                      {t.types[e.type as keyof typeof t.types] ?? e.type}
                    </span>
                    <span className="font-mono text-xs text-ink-subtle tnum">
                      {t.table.balance}: {formatMoney(e.balance, locale)}
                    </span>
                  </div>
                  {e.note && <p className="mt-1 text-2xs text-ink-subtle">{e.note}</p>}
                  <p className="mt-1 text-2xs text-ink-subtle">{timeAgo(e.createdAt, locale)}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5 font-semibold">{t.table.customer}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.type}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.amount}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t.table.balance}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.reference}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.note}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.table.date}</th>
                </tr>
              </thead>
              <tbody>
                {entriesWithBalance.map((e, i) => (
                  <tr key={e.id} className={i % 2 === 1 ? "bg-surface-2" : undefined}>
                    <td className="px-4 py-2.5 font-medium text-ink">{e.customerName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                        {t.types[e.type as keyof typeof t.types] ?? e.type}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tnum ${
                        e.type === "payment" || e.type === "credit_note"
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {e.type === "payment" || e.type === "credit_note" ? "-" : "+"}
                      {formatMoney(Math.abs(e.amount), locale)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink tnum">
                      {formatMoney(e.balance, locale)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted tnum">
                      {e.referenceType ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{e.note ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      {timeAgo(e.createdAt, locale)}
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
