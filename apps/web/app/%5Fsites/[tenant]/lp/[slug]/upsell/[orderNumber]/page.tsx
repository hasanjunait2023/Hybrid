import { redirect } from "next/navigation";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getPublishedLandingPage } from "@/lib/admin/landingPages";
import { getLocale } from "@/lib/i18n/server";
import { UpsellClient } from "./UpsellClient";

interface UpsellPageProps {
  params: Promise<{ tenant: string; slug: string; orderNumber: string }>;
  searchParams: Promise<{ phone?: string }>;
}

// Post-checkout upsell page (Phase 4 multi-step funnel). Shown after COD order
// confirmation when the LP has a post_checkout_upsell configured. If the upsell
// no longer exists, or phone is missing/mismatched, we bail out to the order page.
export default async function UpsellPage({ params, searchParams }: UpsellPageProps) {
  const { tenant: tenantSlug, slug: lpSlug, orderNumber: orderNumberStr } = await params;
  const { phone } = await searchParams;

  const orderNumber = Number(orderNumberStr);
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) {
    redirect(`/order/0`);
  }

  const fallback = `/order/${orderNumber}${phone ? `?phone=${encodeURIComponent(phone)}` : ""}`;

  if (!phone) redirect(fallback);

  const [ctx, locale] = await Promise.all([
    getTenantContextBySlug(tenantSlug),
    getLocale(),
  ]);
  if (!ctx) redirect(fallback);

  const lp = await getPublishedLandingPage(ctx.id, null, lpSlug);
  const upsell = lp?.funnelConfig.post_checkout_upsell;
  if (!upsell?.variant_id || !upsell.price || !upsell.title) redirect(fallback);

  return (
    <UpsellClient
      tenantSlug={tenantSlug}
      lpSlug={lpSlug}
      originalOrderNumber={orderNumber}
      phone={phone}
      upsell={{
        title: upsell.title,
        price: upsell.price,
        image_url: upsell.image_url,
        description: upsell.description,
      }}
      locale={locale}
    />
  );
}
