import { redirect } from "next/navigation";
import { PlusIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listDiscounts, type AdminDiscountRow } from "@/lib/admin/discounts";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { discounts as DiscountsDict } from "@/lib/i18n/dictionaries/en/admin/discounts";
import { PageHeader } from "../_ui";

// Discounts list (DESIGN §Q6). Latin numerals (operator-facing). Shows code,
// type/value, usage, and active window at a glance.
export default async function DiscountsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const discounts = await listDiscounts(tenantId, session.userId);

  const { locale, d: dict } = await getDict();
  const t = dict.admin.discounts;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(discounts.length, locale)} ${t.countSuffix}`}
        action={
          <a
            href="/admin/discounts/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
          >
            <PlusIcon className="h-4 w-4" /> {t.newDiscount}
          </a>
        }
      />

      {discounts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
          {discounts.map((d) => (
            <li key={d.id}>
              <a
                href={`/admin/discounts/${d.id}/edit`}
                className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold uppercase text-ink">{d.code}</p>
                  <p className="text-xs text-ink-muted">{describe(d, t, locale)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className="font-mono text-xs text-ink-subtle tnum">
                    {formatNumber(d.usedCount, locale)}
                    {d.usageLimit != null ? ` / ${formatNumber(d.usageLimit, locale)}` : ""}
                  </span>
                  <StatusChip status={d.status} t={t} />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describe(d: AdminDiscountRow, t: typeof DiscountsDict, locale: Locale): string {
  if (d.type === "percentage") return `${formatNumber(d.value, locale)}${t.describe.percentOff}`;
  if (d.type === "fixed_amount")
    return `${t.describe.fixedOffPrefix}${formatNumber(d.value, locale)} ${t.describe.fixedOffSuffix}`;
  return t.describe.freeShipping;
}

function StatusChip({
  status,
  t,
}: {
  status: AdminDiscountRow["status"];
  t: typeof DiscountsDict;
}) {
  const map: Record<AdminDiscountRow["status"], string> = {
    active: "bg-success-weak text-success",
    scheduled: "bg-surface-2 text-ink-muted",
    disabled: "bg-surface-2 text-ink-muted",
    expired: "bg-danger-weak text-danger",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-2xs font-semibold ${map[status]}`}>
      {t.status[status]}
    </span>
  );
}
