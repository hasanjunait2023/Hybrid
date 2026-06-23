import { notFound } from "next/navigation";
import { CheckIcon } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { buildLocationTree } from "@/lib/location";
import { CheckoutForm } from "./CheckoutForm";

interface CheckoutPageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ payment?: string }>;
}

// Checkout (blueprint S-CHECKOUT, DESIGN P1). Server shell: resolves the tenant,
// builds the Bangla location tree once on the server (avoids shipping the ~2MB
// location package to the client), renders the trust strip + the client form.
export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { tenant: slug } = await params;
  const { payment } = await searchParams;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const locationTree = buildLocationTree();
  const paymentNotice =
    payment === "failed" ? "failed" : payment === "invalid" ? "invalid" : null;

  return (
    <div>
      {/* Trust strip (DESIGN P1.1) — COD-green, visible on the money screen. */}
      <div className="border-b border-border bg-cod-weak">
        <div className="mx-auto flex max-w-[480px] items-center gap-1.5 px-4 py-2 text-xs font-semibold text-cod">
          <CheckIcon width={14} height={14} />
          নিরাপদ অর্ডার · ক্যাশ অন ডেলিভারি
        </div>
      </div>

      <h1 className="mx-auto max-w-[480px] px-4 pt-4 text-xl font-bold text-ink">চেকআউট</h1>

      <CheckoutForm
        tenantSlug={slug}
        storeName={ctx.store.name}
        storePhone={ctx.store.phone ?? null}
        locationTree={locationTree}
        paymentNotice={paymentNotice}
      />
    </div>
  );
}
