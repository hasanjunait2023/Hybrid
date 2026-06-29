import { notFound } from "next/navigation";
import { CheckIcon } from "@hybrid/ui";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { getPublishedLandingPage } from "@/lib/admin/landingPages";
import { buildLocationTree } from "@/lib/location";
import { getDict } from "@/lib/i18n/server";
import { CheckoutForm } from "./CheckoutForm";

interface CheckoutPageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ payment?: string; lp?: string }>;
}

// Checkout (blueprint S-CHECKOUT, DESIGN P1). Server shell: resolves the tenant,
// builds the Bangla location tree once on the server (avoids shipping the ~2MB
// location package to the client), renders the trust strip + the client form.
// ?lp=<slug> — when coming from a landing-page funnel, loads that LP's upsells
// so they appear as order bumps in checkout.
export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { tenant: slug } = await params;
  const { payment, lp: lpSlug } = await searchParams;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  const locationTree = buildLocationTree();
  const paymentNotice =
    payment === "failed" ? "failed" : payment === "invalid" ? "invalid" : null;
  const { d } = await getDict();
  const t = d.storefront.checkout;

  // If arriving via a landing-page funnel, load the upsells from the published LP.
  const lpUpsells =
    lpSlug
      ? await getPublishedLandingPage(ctx.id, null, lpSlug).then(
          (lp) => lp?.funnelConfig.upsells ?? [],
        )
      : [];

  return (
    <div>
      {/* Trust strip (DESIGN P1.1) — COD-green, visible on the money screen. */}
      <div className="border-b border-border bg-cod-weak">
        <div className="mx-auto flex max-w-[480px] items-center gap-1.5 px-4 py-2 text-xs font-semibold text-cod">
          <CheckIcon width={14} height={14} />
          {t.trustStrip}
        </div>
      </div>

      <h1 className="mx-auto max-w-[480px] px-4 pt-4 text-xl font-bold text-ink">{t.title}</h1>

      <CheckoutForm
        tenantSlug={slug}
        storeName={ctx.store.name}
        storePhone={ctx.store.phone ?? null}
        locationTree={locationTree}
        paymentNotice={paymentNotice}
        lpSlug={lpSlug ?? null}
        upsells={lpUpsells}
      />
    </div>
  );
}
