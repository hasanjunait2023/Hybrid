import { notFound } from "next/navigation";
import {
  getStorefrontProducts,
  getStorefrontCollections,
  getTenantContextBySlug,
  getDraftTenantContext,
  type TenantContext,
} from "@/lib/storefront/data";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDict } from "@/lib/i18n/server";
import { ThemeSections } from "./ThemeSections";

interface StorefrontHomeProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ preview?: string }>;
}

// Home (blueprint §7/§8): the seller's chosen + ordered home sections, rendered
// from the published theme settings. ISR via unstable_cache in the data layer.
//
// ?preview=1 renders the unpublished DRAFT instead — but ONLY for an authed
// admin who owns this tenant. The gate is server-side and fail-closed: no
// session, or a session whose active tenant ≠ this store, silently falls back to
// the published view (never an error that confirms the draft exists; never the
// draft to the public).
export default async function StorefrontHome({
  params,
  searchParams,
}: StorefrontHomeProps) {
  const { tenant: slug } = await params;
  const { preview } = await searchParams;

  const published = await getTenantContextBySlug(slug);
  if (!published) notFound();

  const ctx = await resolveContext(slug, published, preview === "1");
  const [products, collections] = await Promise.all([
    getStorefrontProducts(ctx.id),
    getStorefrontCollections(ctx.id),
  ]);

  const isPreview = ctx.settings !== published.settings;
  const { d } = await getDict();

  return (
    <>
      {isPreview && (
        <div
          className="bg-st-pending-weak px-4 py-2 text-center text-sm font-medium text-ink"
          role="status"
        >
          {d.storefront.home.previewBanner}
        </div>
      )}
      <ThemeSections
        settings={ctx.settings}
        storeName={ctx.store.name}
        products={products}
        collections={collections}
      />
    </>
  );
}

// Fail-closed draft gating: only swap in the draft context when the request both
// asks for preview AND comes from an admin session owning this exact tenant.
async function resolveContext(
  slug: string,
  published: TenantContext,
  wantsPreview: boolean,
): Promise<TenantContext> {
  if (!wantsPreview) return published;

  const session = await getSession();
  if (!session) return published;

  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId || tenantId !== published.id) return published;

  const draft = await getDraftTenantContext(slug, tenantId, session.userId);
  return draft ?? published;
}
