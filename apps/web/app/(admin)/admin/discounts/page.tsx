import { redirect } from "next/navigation";
import { PlusIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listDiscounts, type AdminDiscountRow } from "@/lib/admin/discounts";

// Discounts list (DESIGN §Q6). Latin numerals (operator-facing). Shows code,
// type/value, usage, and active window at a glance.
export default async function DiscountsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const discounts = await listDiscounts(tenantId, session.userId);

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">ডিসকাউন্ট</h1>
        <a
          href="/admin/discounts/new"
          className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
        >
          <PlusIcon className="h-4 w-4" /> নতুন ডিসকাউন্ট
        </a>
      </div>

      {discounts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          কোনো ডিসকাউন্ট নেই।
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
          {discounts.map((d) => (
            <li key={d.id}>
              <a
                href={`/admin/discounts/${d.id}/edit`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold uppercase text-ink">{d.code}</p>
                  <p className="text-xs text-ink-muted">{describe(d)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-xs text-ink-subtle tnum">
                    {d.usedCount}
                    {d.usageLimit != null ? ` / ${d.usageLimit}` : ""}
                  </span>
                  <StatusChip status={d.status} />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describe(d: AdminDiscountRow): string {
  if (d.type === "percentage") return `${d.value}% ছাড়`;
  if (d.type === "fixed_amount") return `৳${d.value} ছাড়`;
  return "ফ্রি ডেলিভারি";
}

function StatusChip({ status }: { status: AdminDiscountRow["status"] }) {
  const map: Record<AdminDiscountRow["status"], string> = {
    active: "bg-success-weak text-success",
    scheduled: "bg-surface-2 text-ink-muted",
    disabled: "bg-surface-2 text-ink-muted",
    expired: "bg-danger-weak text-danger",
  };
  const label: Record<AdminDiscountRow["status"], string> = {
    active: "সক্রিয়",
    scheduled: "নির্ধারিত",
    disabled: "বন্ধ",
    expired: "মেয়াদোত্তীর্ণ",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${map[status]}`}>
      {label[status]}
    </span>
  );
}
