import { notFound } from "next/navigation";
import { CheckIcon } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { buildLocationTree } from "@/lib/location";
import { getDict } from "@/lib/i18n/server";
import { WholesaleCheckoutForm } from "./CheckoutForm";

interface WholesaleCheckoutPageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ payment?: string }>;
}

export default async function WholesaleCheckoutPage({
  params,
  searchParams,
}: WholesaleCheckoutPageProps) {
  const { tenant: slug } = await params;
  const { payment } = await searchParams;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const locationTree = buildLocationTree();
  const paymentNotice =
    payment === "failed" ? "failed" : payment === "invalid" ? "invalid" : null;
  const { d } = await getDict();
  const t = d.storefront.checkout;

  return (
    <div>
      {/* Trust strip */}
      <div className="border-b border-border bg-cod-weak">
        <div className="mx-auto flex max-w-[480px] items-center gap-1.5 px-4 py-2 text-xs font-semibold text-cod">
          <CheckIcon width={14} height={14} />
          🏭 পাইকারি অর্ডার — নিরাপদ ও বিশ্বস্ত
        </div>
      </div>

      <h1 className="mx-auto max-w-[480px] px-4 pt-4 text-xl font-bold text-ink">
        🏭 পাইকারি চেকআউট
      </h1>

      <WholesaleCheckoutForm
        tenantSlug={slug}
        storeName={ctx.store.name}
        storePhone={ctx.store.phone ?? null}
        locationTree={locationTree}
        paymentNotice={paymentNotice}
      />
    </div>
  );
}
