import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getOrderDetail } from "@/lib/admin/orders";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "../../_ui";
import { CreateReturnForm } from "./CreateReturnForm";

// Create a return / exchange from an order. Driven by ?order=<orderId> (linked
// from order detail). Without it, shows a short instruction + link back to the
// order list. Fetches the order's items via getOrderDetail. Server component.
interface NewReturnPageProps {
  searchParams: Promise<{ order?: string }>;
}

export default async function NewReturnPage({ searchParams }: NewReturnPageProps) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const orderId = sp.order?.trim();

  const order = orderId ? await getOrderDetail(tenantId, session.userId, orderId) : null;

  const { d } = await getDict();
  const t = d.admin.returns;

  return (
    <div className="space-y-4">
      <a href="/admin/returns" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← {t.backToList}
      </a>

      <PageHeader
        title={t.create.title}
        subtitle={
          order
            ? `${t.create.fromOrderPrefix} #${order.orderNumber}${t.create.fromOrderSuffix ? ` ${t.create.fromOrderSuffix}` : ""}`
            : undefined
        }
      />

      {!order ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
          <p className="text-ink-muted">
            {t.create.instruction}
          </p>
          <a
            href="/admin/orders"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover"
          >
            {t.create.ordersList}
          </a>
        </div>
      ) : (
        <CreateReturnForm
          orderId={order.id}
          orderNumber={order.orderNumber}
          items={order.items.map((it) => ({
            orderItemId: it.id,
            variantId: it.variantId,
            title: it.title,
            unitPrice: it.unitPrice,
            maxQuantity: it.quantity,
          }))}
        />
      )}
    </div>
  );
}
