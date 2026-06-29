import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listPlans, checkPlanLimit } from "@/lib/platform/plans";
import { asPlatformAdmin } from "@hybrid/db";
import { getTenantOwnerPhone } from "./actions";
import { UpgradePlanButton } from "./UpgradePlanButton";

// Tenant billing & plan page. Shows current plan, live usage vs. limits,
// and the plan catalog for self-serve upgrade via bKash (Phase 3).
async function getTenantSubscription(tenantId: string) {
  return asPlatformAdmin(async (tx) => {
    const rows = await tx<{
      plan_name: string | null;
      plan_code: string | null;
      status: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
      price_bdt: string | null;
      billing_interval: string | null;
    }[]>`
      select
        p.name  as plan_name,
        p.code  as plan_code,
        coalesce(s.status::text, t.status::text) as status,
        t.trial_ends_at,
        s.current_period_end,
        p.price_bdt,
        p.billing_interval
      from tenant t
      left join subscription s on s.tenant_id = t.id
        and s.status in ('trialing','active','past_due')
      left join plan p on p.id = coalesce(s.plan_id, t.plan_id)
      where t.id = ${tenantId}
      limit 1
    `;
    return rows[0] ?? null;
  });
}

const STATUS_LABEL: Record<string, string> = {
  trial: "ট্রায়াল",
  trialing: "ট্রায়াল",
  active: "সক্রিয়",
  past_due: "পেমেন্ট বাকি",
  suspended: "সাসপেন্ড",
  cancelled: "বাতিল",
};

const STATUS_COLOR: Record<string, string> = {
  trial: "bg-primary-weak text-primary",
  trialing: "bg-primary-weak text-primary",
  active: "bg-success-weak text-success",
  past_due: "bg-warning-weak text-warning",
  suspended: "bg-danger-weak text-danger",
  cancelled: "bg-surface-2 text-ink-muted",
};

interface BillingPageProps {
  searchParams: Promise<{ billing?: string }>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const billingOutcome = sp.billing ?? null;

  const [sub, plans, productLimit, orderLimit, domainLimit, staffLimit, ownerPhone] = await Promise.all([
    getTenantSubscription(tenantId),
    listPlans(),
    checkPlanLimit(tenantId, "product"),
    checkPlanLimit(tenantId, "order"),
    checkPlanLimit(tenantId, "domain"),
    checkPlanLimit(tenantId, "staff"),
    getTenantOwnerPhone(),
  ]);

  const status = sub?.status ?? "trial";
  const activePlanCode = sub?.plan_code ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <h1 className="text-xl font-bold text-ink">বিলিং ও প্ল্যান</h1>

      {/* Payment outcome banner */}
      {billingOutcome === "activated" && (
        <div className="rounded-lg border border-success bg-success-weak px-4 py-3 text-sm font-medium text-success">
          প্ল্যান আপগ্রেড সফল হয়েছে! আপনার নতুন সীমা এখনই কার্যকর।
        </div>
      )}
      {billingOutcome === "failed" && (
        <div className="rounded-lg border border-danger bg-danger-weak px-4 py-3 text-sm font-medium text-danger">
          পেমেন্ট সফল হয়নি। আবার চেষ্টা করুন বা support@hybrid.ecomex.cloud -এ যোগাযোগ করুন।
        </div>
      )}
      {billingOutcome === "cancelled" && (
        <div className="rounded-lg border border-warning bg-warning-weak px-4 py-3 text-sm font-medium text-warning">
          পেমেন্ট বাতিল করা হয়েছে।
        </div>
      )}

      {/* Current subscription */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-ink-muted">বর্তমান প্ল্যান</p>
            <p className="mt-0.5 text-lg font-bold text-ink">{sub?.plan_name ?? "ফ্রি ট্রায়াল"}</p>
            {sub?.price_bdt && (
              <p className="text-sm text-ink-muted">
                ৳{Number(sub.price_bdt).toLocaleString("bn-BD")} /{sub.billing_interval === "yearly" ? "বছর" : "মাস"}
              </p>
            )}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[status] ?? "bg-surface-2 text-ink-muted"}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>

        {sub?.trial_ends_at && (status === "trial" || status === "trialing") && (
          <p className="mt-3 text-xs text-ink-muted">
            ট্রায়াল শেষ হবে: <strong>{new Date(sub.trial_ends_at).toLocaleDateString("bn-BD")}</strong>
          </p>
        )}
        {sub?.current_period_end && status === "past_due" && (
          <p className="mt-3 text-xs text-danger">
            পেমেন্ট বাকি ছিল: {new Date(sub.current_period_end).toLocaleDateString("bn-BD")}
          </p>
        )}
      </section>

      {/* Usage vs limits */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-semibold text-ink">ব্যবহার</p>
        <div className="space-y-3">
          <UsageRow label="পণ্য" used={productLimit.used} limit={productLimit.limit} />
          <UsageRow label="এই মাসে অর্ডার" used={orderLimit.used} limit={orderLimit.limit} />
          <UsageRow label="কাস্টম ডোমেইন" used={domainLimit.used} limit={domainLimit.limit} />
          <UsageRow label="স্টাফ সদস্য" used={staffLimit.used} limit={staffLimit.limit} />
        </div>
      </section>

      {/* Plan catalog */}
      <section className="space-y-3">
        <p className="text-sm font-semibold text-ink">প্ল্যান পরিবর্তন করুন</p>
        {plans.filter((p) => p.isActive).map((plan) => {
          const isCurrent = plan.code === activePlanCode;
          return (
            <div
              key={plan.id}
              className={`rounded-lg border p-4 ${isCurrent ? "border-primary bg-primary/5" : "border-border bg-surface"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    {plan.name}
                    {isCurrent && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">বর্তমান</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    ৳{plan.priceBdt.toLocaleString("bn-BD")} / {plan.billingInterval === "yearly" ? "বছর" : "মাস"}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                    <li>{plan.maxProducts == null ? "✓ সীমাহীন পণ্য" : `✓ সর্বোচ্চ ${plan.maxProducts} পণ্য`}</li>
                    <li>{plan.maxOrdersMonth == null ? "✓ সীমাহীন অর্ডার" : `✓ মাসে ${plan.maxOrdersMonth} অর্ডার`}</li>
                    <li>✓ {plan.maxCustomDomains} কাস্টম ডোমেইন</li>
                    <li>✓ {plan.maxStaff} স্টাফ অ্যাকাউন্ট</li>
                  </ul>
                </div>
                {!isCurrent && plan.priceBdt > 0 && (
                  <UpgradePlanButton
                    planId={plan.id}
                    planName={plan.name}
                    priceBdt={plan.priceBdt}
                    defaultPhone={ownerPhone}
                  />
                )}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-ink-muted">
          বিকাশে পেমেন্ট সম্পন্ন হলে প্ল্যান স্বয়ংক্রিয়ভাবে সক্রিয় হবে। সহায়তার জন্য support@hybrid.ecomex.cloud -এ যোগাযোগ করুন।
        </p>
      </section>
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = limit !== null && used >= limit;
  const nearLimit = limit !== null && pct >= 80;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className={`font-mono font-medium tnum ${atLimit ? "text-danger" : nearLimit ? "text-warning" : "text-ink"}`}>
          {used}{limit !== null ? ` / ${limit}` : ""}
          {limit === null ? " (সীমাহীন)" : ""}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-all ${atLimit ? "bg-danger" : nearLimit ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
