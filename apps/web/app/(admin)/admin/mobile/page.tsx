import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { withTenant } from "@hybrid/db";
import { MobileQuickStats } from "../MobileQuickStats";
import { PageHeader } from "../_ui";

// Mobile-first dashboard for staff on the floor — one-handed workflow.
// Shows: my assigned orders + new orders awaiting action + quick stats.
// Auto-loaded by mobile nav (AdminNav.tsx variant='tabs' on phones).

export const dynamic = "force-dynamic";

async function getDashboardSnapshot(tenantId: string, userId: string) {
  return withTenant(tenantId, userId, async (tx) => {
    const today = await tx<{ n: number; rev: string }[]>`
      select count(*)::int as n, coalesce(sum(grand_total), 0) as rev
      from orders where placed_at >= current_date and fulfillment_status <> 'cancelled'
    `;
    const myAssigned = await tx<{ n: number }[]>`
      select count(*)::int as n from orders
      where assignee_id = app.current_user_id()
        and fulfillment_status not in ('delivered', 'cancelled', 'returned')
    `;
    const pending = await tx<{ n: number }[]>`
      select count(*)::int as n from orders
      where fulfillment_status = 'pending'
    `;
    return {
      todayCount: today[0]?.n ?? 0,
      todayRevenue: Number(today[0]?.rev ?? 0),
      myAssigned: myAssigned[0]?.n ?? 0,
      pending: pending[0]?.n ?? 0,
    };
  });
}

export default async function MobileDashboard() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [{ d }, snapshot] = await Promise.all([
    getDict(),
    getDashboardSnapshot(tenantId, session.userId),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.admin.dashboard.greeting}
        subtitle="মোবাইল ভিউ"
      />

      <MobileQuickStats
        todayOrders={snapshot.todayCount}
        todayRevenue={snapshot.todayRevenue}
        pendingConfirm={snapshot.pending}
        codPending={0}
        lowStock={0}
        locale="bn"
      />

      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/admin/orders?assigned=me"
          className="flex h-24 flex-col items-center justify-center rounded-lg border border-border bg-surface p-4 shadow-xs transition-shadow hover:shadow-md active:scale-[0.98]"
        >
          <span className="text-2xl">📋</span>
          <p className="mt-1 text-xs font-semibold text-ink">আমার অর্ডার</p>
          <p className="font-mono text-lg font-bold text-primary tnum">
            {formatNumber(snapshot.myAssigned, "bn")}
          </p>
        </Link>
        <Link
          href="/admin/orders?status=pending"
          className="flex h-24 flex-col items-center justify-center rounded-lg border border-border bg-surface p-4 shadow-xs transition-shadow hover:shadow-md active:scale-[0.98]"
        >
          <span className="text-2xl">⏳</span>
          <p className="mt-1 text-xs font-semibold text-ink">কনফার্ম অপেক্ষা</p>
          <p className="font-mono text-lg font-bold text-warning tnum">
            {formatNumber(snapshot.pending, "bn")}
          </p>
        </Link>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          আজকের বিক্রি
        </p>
        <p className="mt-2 font-mono text-3xl font-bold text-ink tnum">
          {formatMoney(snapshot.todayRevenue, "bn")}
        </p>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          দ্রুত অ্যাকশন
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href="/admin/orders/new"
            className="rounded-md bg-primary px-3 py-2.5 text-center text-xs font-semibold text-ink-on-primary shadow-xs active:scale-[0.98]"
          >
            + নতুন অর্ডার
          </Link>
          <Link
            href="/admin/orders?status=ready_to_ship"
            className="rounded-md bg-primary-weak px-3 py-2.5 text-center text-xs font-semibold text-primary shadow-xs active:scale-[0.98]"
          >
            🚚 শিপ করুন
          </Link>
          <Link
            href="/admin/products"
            className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-center text-xs font-semibold text-ink active:scale-[0.98]"
          >
            📦 পণ্য
          </Link>
          <Link
            href="/admin/customers"
            className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-center text-xs font-semibold text-ink active:scale-[0.98]"
          >
            👥 গ্রাহক
          </Link>
        </div>
      </section>
    </div>
  );
}