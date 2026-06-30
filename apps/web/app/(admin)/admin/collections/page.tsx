import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { PlusIcon } from "@hybrid/ui";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCollections } from "@/lib/admin/catalog";
import { getDict } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { PageHeader } from "../_ui";

// Collections list (DESIGN §P4). The "আরও" tab destination on mobile. Simple
// manual collections; rule-based is Phase 2.
export default async function CollectionsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const collections = await listCollections(tenantId, session.userId);

  const { locale, d } = await getDict();
  const t = d.admin.collections;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={`${formatNumber(collections.length, locale)} ${t.countSuffix}`}
        action={
          <a
            href="/admin/collections/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
          >
            <PlusIcon className="h-4 w-4" /> {t.newCollection}
          </a>
        }
      />

      {collections.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
          {collections.map((c) => (
            <li key={c.id}>
              <a
                href={`/admin/collections/${c.id}/edit`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-2"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{c.title}</p>
                  <p className="font-mono text-xs text-ink-subtle">{c.slug}</p>
                </div>
                <span className="font-mono text-sm text-ink-muted tnum">{formatNumber(c.productCount, locale)} {t.itemCountSuffix}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
