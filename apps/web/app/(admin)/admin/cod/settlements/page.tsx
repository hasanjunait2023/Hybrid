import { redirect } from "next/navigation";
import { formatBdtLatin, StatusBadge, DeltaAmount, DiscrepancyStat, EmptyState } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getSettlements } from "@/lib/admin/cod";
import { RemittanceUpload } from "./RemittanceUpload";
import { ResolveButton } from "./ResolveButton";

// COD & Settlements view (DESIGN §Q3 — THE differentiator). Operator-facing →
// Latin numerals + mono tnum. Discrepancies are made VISUALLY UNMISSABLE: danger
// row tint + left edge bar + গরমিল chip; matched rows stay calm. Every amount is
// REAL — written only by the reconciliation engine from a courier CSV.
export default async function SettlementsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { summary, rows, batches } = await getSettlements(tenantId, session.userId);

  return (
    <div lang="en" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">COD ও সেটেলমেন্ট</h1>
        <RemittanceUpload />
      </div>

      {/* Q3.1 Summary band — the morning glance. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium text-ink-muted">প্রত্যাশিত COD</p>
          <p className="mt-1 font-mono text-2xl font-bold tnum text-ink">{formatBdtLatin(summary.expected)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium text-ink-muted">সংগৃহীত</p>
          <p className="mt-1 font-mono text-2xl font-bold tnum text-cod">{formatBdtLatin(summary.collected)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium text-ink-muted">জমা হয়েছে</p>
          <p className="mt-1 font-mono text-2xl font-bold tnum text-cod">{formatBdtLatin(summary.remitted)}</p>
        </div>
        <DiscrepancyStat
          label="গরমিল / বকেয়া"
          amount={summary.discrepancy}
          discrepancyCount={summary.discrepancyCount}
        />
      </div>

      {/* Q3.2 Per-shipment match table — the evidence. */}
      {rows.length === 0 ? (
        <EmptyState
          title="এখনো কোনো COD চালান নেই"
          hint="অর্ডার কুরিয়ারে পাঠালে এখানে দেখা যাবে; রেমিট্যান্স CSV আপলোড করে মিলিয়ে নিন।"
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-2xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">চালান / অর্ডার</th>
                <th className="px-3 py-2 text-right font-semibold">প্রত্যাশিত</th>
                <th className="px-3 py-2 text-right font-semibold">সংগৃহীত</th>
                <th className="px-3 py-2 text-right font-semibold">জমা</th>
                <th className="px-3 py-2 text-right font-semibold">Δ গরমিল</th>
                <th className="px-3 py-2 text-left font-semibold">অবস্থা</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isDiscrepancy = r.codStatus === "discrepancy";
                // "No remittance for a delivered shipment" — the most serious case.
                const missing = isDiscrepancy && r.remitted == null;
                return (
                  <tr
                    key={r.shipmentId}
                    className={
                      isDiscrepancy
                        ? "border-l-[3px] border-l-danger bg-danger-weak/40"
                        : "border-t border-border"
                    }
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs font-semibold text-ink">
                        {r.consignmentId ?? "—"}
                      </span>
                      <span className="ml-2 font-mono text-2xs text-ink-subtle">#{r.orderNumber}</span>
                      <div className="text-2xs text-ink-muted">{r.customerName ?? "—"}</div>
                      {missing && (
                        <div className="mt-0.5 text-2xs font-semibold text-danger">
                          ⚠ রেমিট্যান্স পাওয়া যায়নি
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink">{formatBdtLatin(r.expected)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink-muted">
                      {r.collected == null ? "—" : formatBdtLatin(r.collected)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink-muted">
                      {r.remitted == null ? "—" : formatBdtLatin(r.remitted)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DeltaAmount amount={r.discrepancy} missing={missing} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge kind="cod" value={r.codStatus} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isDiscrepancy && <ResolveButton shipmentId={r.shipmentId} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Q3.3 Remittance batch list. */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">রেমিট্যান্স ব্যাচ</h2>
        {batches.length === 0 ? (
          <EmptyState
            title="এখনো কোনো রেমিট্যান্স আপলোড হয়নি"
            hint="কুরিয়ার থেকে CSV নামিয়ে আপলোড করুন।"
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {batches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-ink">{b.reference ?? b.id.slice(0, 8)}</span>
                  <span className="ml-2 text-2xs uppercase text-ink-muted">{b.provider}</span>
                  <div className="text-2xs text-ink-muted">
                    {new Date(b.createdAt).toLocaleDateString("en-GB")}
                    {b.unmatchedCount > 0 && (
                      <span className="ml-2 text-warning">মেলেনি: {b.unmatchedCount}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-semibold tnum text-ink">{formatBdtLatin(b.totalAmount)}</div>
                  <span className="text-2xs text-ink-muted">{b.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-md bg-surface-2 px-3 py-2 text-2xs text-ink-muted">
        সব হিসাব আপনার নিজের ডেটা থেকে — Hybrid কোনো টাকা ছোঁয় না।
      </p>
    </div>
  );
}
