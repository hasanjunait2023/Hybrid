import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId, getAdminProduct } from "@/lib/admin/data";
import { EditProductForm } from "./EditProductForm";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

// Edit a product + its primary variant (blueprint §7). Server-loads the record
// under the user's tenant (RLS), renders the client form that posts the
// updateProduct Server Action.
export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;

  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform"); // membership-less (e.g. platform admin)

  const product = await getAdminProduct(tenantId, session.userId, id);
  if (!product) notFound();

  return (
    <div>
      <div className="mb-5">
        <a
          href="/admin/products"
          className="text-sm font-medium text-ink-muted hover:text-primary"
        >
          ← পণ্য তালিকা
        </a>
        <h1 className="mt-2 text-2xl font-bold text-ink">{product.title}</h1>
      </div>
      <EditProductForm product={product} />
    </div>
  );
}
