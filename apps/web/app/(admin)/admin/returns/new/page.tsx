import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getOrderDetail } from "@/lib/admin/orders";
import { PageHeader } from "../../_ui";
import { CreateReturnForm } from "./CreateReturnForm";

// Create a return / exchange from an order. Driven by ?order=<orderId> (linked
// from order detail). Without it, shows a short instruction + link back to the
// order list. Fetches the order's items via getOrderDetail. Server component.
interface NewReturnPageProps {
  searchParams: Promise<{ order?: string }>;
}

export default async function NewReturnPage({ searchParams }: NewReturnPageProps) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const sp = await searchParams;
  const orderId = sp.order?.trim();

  const order = orderId ? await getOrderDetail(tenantId, session.userId, orderId) : null;

  return (
    <div lang="en" className="space-y-4">
      <a href="/admin/returns" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← রিটার্ন তালিকা
      </a>

      <PageHeader
        title="নতুন রিটার্ন"
        subtitle={order ? `অর্ডার #${order.orderNumber} থেকে` : undefined}
      />

      {!order ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
          <p className="text-ink-muted">
            রিটার্ন তৈরি করতে একটি অর্ডার নির্বাচন করুন। অর্ডারের বিস্তারিত পেজ থেকে রিটার্ন শুরু করুন।
          </p>
          <a
            href="/admin/orders"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover"
          >
            অর্ডার তালিকা
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
