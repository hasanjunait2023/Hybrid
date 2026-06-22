import { redirect } from "next/navigation";
import { formatBdtLatin } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId, getAdminProducts } from "@/lib/admin/data";

// Admin product list (blueprint §7). Dense table, Latin numerals + tabular-nums
// (DESIGN §4.4/§7.5), zebra rows, status chips. Row → edit.
export default async function AdminProductsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform"); // membership-less (e.g. platform admin)

  const products = await getAdminProducts(tenantId, session.userId);

  return (
    <div lang="en">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">পণ্য</h1>
        <span className="text-sm text-ink-muted tnum">{products.length} টি</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-semibold">নাম</th>
              <th className="px-4 py-3 font-semibold">স্ট্যাটাস</th>
              <th className="px-4 py-3 text-right font-semibold">দাম</th>
              <th className="px-4 py-3 text-right font-semibold">স্টক</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr
                key={p.id}
                className={i % 2 === 1 ? "bg-surface-2" : undefined}
              >
                <td className="px-4 py-3">
                  <a
                    href={`/admin/products/${p.id}/edit`}
                    className="font-medium text-ink hover:text-primary hover:underline"
                  >
                    {p.title}
                  </a>
                  <div className="font-mono text-xs text-ink-subtle">{p.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={p.status} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-ink tnum">
                  {formatBdtLatin(p.price)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-ink-muted tnum">
                  {p.inventory}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`/admin/products/${p.id}/edit`}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    এডিট
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <p className="px-4 py-10 text-center text-ink-muted">কোনো পণ্য নেই।</p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    active: { tone: "bg-success-weak text-success", label: "Active" },
    draft: { tone: "bg-warning-weak text-warning", label: "Draft" },
    archived: { tone: "bg-surface-2 text-ink-muted", label: "Archived" },
  };
  const s = map[status] ?? { tone: "bg-surface-2 text-ink-muted", label: status };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s.tone}`}
    >
      {s.label}
    </span>
  );
}
