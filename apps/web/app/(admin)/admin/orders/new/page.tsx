import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { buildLocationTree } from "@/lib/location";
import { getDict } from "@/lib/i18n/server";
import { ManualOrderForm } from "./ManualOrderForm";

// Manual Order Entry (DESIGN §P3.4) — the F-commerce killer feature. Full-screen
// on mobile, wide centered on desktop. Keyboard-first; Tab-through, Enter adds a
// product line, returning-customer phone autofill. The location tree is built
// once on the server and handed to the client picker (avoids shipping the ~2MB
// package to the bundle).
export default async function NewManualOrderPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const locationTree = buildLocationTree();
  const { d } = await getDict();
  const t = d.admin.orders.create;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <a href="/admin/orders" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← {t.backToOrders}
        </a>
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
      </div>
      <ManualOrderForm locationTree={locationTree} />
    </div>
  );
}
