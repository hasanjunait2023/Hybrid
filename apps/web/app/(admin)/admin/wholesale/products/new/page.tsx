import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { WholesaleProductForm, type WholesaleProductFormData } from "../WholesaleProductForm";

// New wholesale product page.
export default async function NewWholesaleProductPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { d } = await getDict();
  const t = d.admin.wholesale.products;

  const initial: WholesaleProductFormData = {
    title: "",
    description: "",
    status: "draft",
    isWholesale: true,
    wholesaleOnly: false,
    moq: 0,
    wholesalePrice: 0,
    tierPrices: [],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/wholesale/products" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← {t.title}
        </a>
        <h1 className="text-xl font-bold text-ink">{t.newProduct}</h1>
      </div>
      <WholesaleProductForm initial={initial} />
    </div>
  );
}
