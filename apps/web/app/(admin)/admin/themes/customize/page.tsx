import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  getOrCreateDraftTheme,
  getPublishedTheme,
  getTenantSlug,
  listCollectionOptions,
} from "@/lib/theme/data";
import { Customizer } from "./Customizer";

// Visual customizer (DESIGN §Q1). Opens on the tenant's draft (created from the
// published settings on first visit, never a blank slate). The client island
// owns the panel/preview split, the four control groups, autosave, and publish.
export const dynamic = "force-dynamic";

export default async function CustomizePage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [draft, published, slug, collections] = await Promise.all([
    getOrCreateDraftTheme(tenantId, session.userId),
    getPublishedTheme(tenantId, session.userId),
    getTenantSlug(tenantId, session.userId),
    listCollectionOptions(tenantId, session.userId),
  ]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me:3000";
  const previewUrl = slug ? `//${slug}.${rootDomain}/?preview=1` : null;

  const hasPublished = published != null;

  return (
    <Customizer
      initialSettings={draft.settings}
      collections={collections}
      previewUrl={previewUrl}
      hasPublished={hasPublished}
    />
  );
}
