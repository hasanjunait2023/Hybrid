import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { getStorePageBySlug } from "@/lib/admin/pages";
import { PageForm } from "./PageForm";

// Store page editor. `/admin/settings/pages/new` → blank create form; any other
// slug → edit the existing page.
export const dynamic = "force-dynamic";

export default async function StorePageEditor(props: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { slug } = await props.params;
  const isNew = slug === "new";
  const page = isNew ? null : await getStorePageBySlug(tenantId, session.userId, slug);
  if (!isNew && !page) notFound();

  return (
    <div className="max-w-2xl space-y-5">
      <a
        href="/admin/settings/pages"
        className="text-sm font-medium text-ink-muted hover:text-primary"
      >
        ← পেজসমূহ
      </a>
      <h1 className="text-xl font-bold text-ink">{isNew ? "নতুন পেজ" : page!.title}</h1>
      <PageForm page={page} />
    </div>
  );
}
