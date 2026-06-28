import { redirect } from "next/navigation";
import { withTenant } from "@hybrid/db";
import { formatBdtBangla } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

// Vendor's marketplace commission ledger (record-only; no payout in the base).
export default async function MarketplaceCommissionPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { rows, total } = await withTenant(tenantId, session.userId, async (tx) => {
    const rows = await tx<{ gross: string; rate: string; commission_amount: string; created_at: string }[]>`
      select gross, rate, commission_amount, created_at
        from marketplace_commission where tenant_id = ${tenantId}
       order by created_at desc limit 100
    `;
    const sum = await tx<{ total: string | null }[]>`
      select coalesce(sum(commission_amount), 0) as total
        from marketplace_commission where tenant_id = ${tenantId}
    `;
    return { rows, total: Number(sum[0]?.total ?? 0) };
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">মার্কেটপ্লেস কমিশন</h1>
      <p className="text-sm text-ink-muted">
        মোট প্ল্যাটফর্ম কমিশন: <strong>{formatBdtBangla(total)}</strong>
      </p>
      {rows.length === 0 ? (
        <p className="text-ink-muted">এখনো কোনো মার্কেটপ্লেস বিক্রি নেই।</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th className="py-2">বিক্রয় (gross)</th>
              <th>রেট</th>
              <th>কমিশন</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2">{formatBdtBangla(Number(r.gross))}</td>
                <td>{(Number(r.rate) * 100).toFixed(1)}%</td>
                <td>{formatBdtBangla(Number(r.commission_amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
