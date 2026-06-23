import { redirect } from "next/navigation";
import { PlusIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCollections } from "@/lib/admin/catalog";

// Collections list (DESIGN §P4). The "আরও" tab destination on mobile. Simple
// manual collections; rule-based is Phase 2.
export default async function CollectionsPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const collections = await listCollections(tenantId, session.userId);

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">কালেকশন</h1>
        <a
          href="/admin/collections/new"
          className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
        >
          <PlusIcon className="h-4 w-4" /> নতুন কালেকশন
        </a>
      </div>

      {collections.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-ink-muted">
          কোনো কালেকশন নেই।
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
                <span className="font-mono text-sm text-ink-muted tnum">{c.productCount} টি</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
