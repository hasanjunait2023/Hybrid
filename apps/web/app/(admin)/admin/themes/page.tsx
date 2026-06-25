import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getActiveThemeCode, getTenantSlug } from "@/lib/theme/data";
import { THEME_CATALOG } from "@/lib/theme/catalog";
import { getDict } from "@/lib/i18n/server";
import { ThemeCatalog } from "./ThemeCatalog";

// Theme catalog / picker (DESIGN §Q2). Operator-facing. Lists the 3 starter
// themes; the active one is ringed + badged. Activate (with confirm) and
// preview-before-activate run in the client island below. Activation switches
// the DRAFT to the theme defaults and lands the seller in the customizer.
export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const [activeCode, slug] = await Promise.all([
    getActiveThemeCode(tenantId, session.userId),
    getTenantSlug(tenantId, session.userId),
  ]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me:3000";
  const previewBase = slug ? `//${slug}.${rootDomain}` : null;

  const themes = THEME_CATALOG.map((t) => ({
    code: t.code,
    name: t.name,
    descriptor: t.descriptor,
    category: t.category,
  }));

  const { d } = await getDict();
  const t = d.admin.themes;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.subtitle}</p>
      </header>

      <ThemeCatalog
        themes={themes}
        activeCode={activeCode}
        previewBase={previewBase}
      />
    </div>
  );
}
