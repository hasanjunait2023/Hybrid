import { notFound } from "next/navigation";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getPublicAnalyticsIds } from "@/lib/analytics/config";
import { readConsentFromCookieHeader } from "@/lib/analytics/consent";
import { cookies } from "next/headers";
import { StorefrontTracker } from "@/app/_components/StorefrontTracker";
import { CartIsland } from "./CartIsland";

interface CartPageProps {
  params: Promise<{ tenant: string }>;
}

// Cart (blueprint S-CHECKOUT). Server shell resolves/guards the tenant; the cart
// itself is the client island reading localStorage (no server cart).
export default async function CartPage({ params }: CartPageProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const publicIds = await getPublicAnalyticsIds(ctx.id, null);
  const consent = readConsentFromCookieHeader((await cookies()).toString());

  return (
    <>
      <StorefrontTracker
        ids={publicIds}
        pageType="cart"
        consent={consent.categories.analytics ?? true}
        firePageView={false}
      />
      <CartIsland tenantSlug={slug} />
    </>
  );
}
