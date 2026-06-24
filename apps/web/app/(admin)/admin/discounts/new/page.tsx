import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { DiscountForm } from "../DiscountForm";

export default async function NewDiscountPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/discounts" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← ডিসকাউন্ট
        </a>
        <h1 className="text-xl font-bold text-ink">নতুন ডিসকাউন্ট</h1>
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
