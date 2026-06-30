import Link from "next/link";
import { requireSession } from "@/lib/auth/requireSession";
import { redirect } from "next/navigation";
import { getActiveTenantId } from "@/lib/admin/data";
import { listStorePages } from "@/lib/admin/pages";

// Store pages list (privacy / returns / terms / about / custom). The storefront
// renders published pages at /pages/[slug]; the footer links to them.
export const dynamic = "force-dynamic";

export default async function StorePagesSettings() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const pages = await listStorePages(tenantId, session.userId);

  return (
    <div className="max-w-2xl space-y-5">
      <a href="/admin/settings" className="text-sm font-medium text-ink-muted hover:text-primary">
        ← সেটিংস
      </a>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">পেজ</h1>
          <p className="text-sm text-ink-muted">প্রাইভেসি, রিটার্ন, শর্তাবলী ও কাস্টম পেজ।</p>
        </div>
        <Link
          href="/admin/settings/pages/new"
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold leading-9 text-white"
        >
          নতুন পেজ
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {pages.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">এখনো কোনো পেজ নেই।</p>
        ) : (
          <ul className="divide-y divide-border">
            {pages.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/settings/pages/${p.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{p.title}</span>
                    <span className="block font-mono text-xs text-ink-muted">/pages/{p.slug}</span>
                  </span>
                  <span
                    className={
                      p.status === "published"
                        ? "rounded-full bg-success-weak px-2 py-0.5 text-2xs font-semibold text-success"
                        : "rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted"
                    }
                  >
                    {p.status === "published" ? "প্রকাশিত" : "খসড়া"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
