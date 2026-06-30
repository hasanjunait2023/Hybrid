import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { DiscountForm } from "../DiscountForm";

export default async function NewDiscountPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { d } = await getDict();
  const t = d.admin.discounts;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/discounts" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← {t.form.backToDiscounts}
        </a>
        <h1 className="text-xl font-bold text-ink">{t.form.newDiscount}</h1>
      </div>
      <DiscountForm
        initial={{
          code: "",
          title: "",
          type: "percentage",
          value: "",
          minSubtotal: "",
          usageLimit: "",
          perCustomerLimit: "",
          startsAt: "",
          endsAt: "",
          status: "active",
        }}
      />
    </div>
  );
}
