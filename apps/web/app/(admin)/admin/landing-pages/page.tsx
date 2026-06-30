import { redirect } from "next/navigation";
import { PlusIcon } from "@hybrid/ui";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listLandingPages, type LandingPageRow } from "@/lib/admin/landingPages";
import { PageHeader } from "../_ui";

// Landing pages list — funnel builder (Phase 3).
export default async function LandingPagesPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const pages = await listLandingPages(tenantId, session.userId);

  const published = pages.filter((p) => p.status === "published").length;
  const draft = pages.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="ল্যান্ডিং পেজ"
        subtitle={`${pages.length} পেজ · ${published} প্রকাশিত · ${draft} ড্রাফট`}
        action={
          <a
            href="/admin/landing-pages/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
          >
            <PlusIcon className="h-4 w-4" /> নতুন পেজ
          </a>
        }
      />

      {pages.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
          <p className="text-ink-muted">কোনো ল্যান্ডিং পেজ নেই।</p>
          <a href="/admin/landing-pages/new" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline">
            প্রথম পেজ তৈরি করুন →
          </a>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {pages.map((p) => (
            <li key={p.id}>
              <a
                href={`/admin/landing-pages/${p.id}`}
                className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{p.title ?? "(শিরোনাম নেই)"}</p>
                  <p className="font-mono text-xs text-ink-muted">/{p.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {p.publishedAt ? (
                    <span className="hidden text-xs text-ink-subtle sm:inline">
                      {new Date(p.publishedAt).toLocaleDateString("bn-BD")}
                    </span>
                  ) : null}
                  <StatusChip status={p.status} />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: LandingPageRow["status"] }) {
  const map: Record<LandingPageRow["status"], { bg: string; label: string }> = {
    draft: { bg: "bg-st-pending-weak text-st-pending", label: "ড্রাফট" },
    published: { bg: "bg-success-weak text-success", label: "প্রকাশিত" },
    archived: { bg: "bg-surface-2 text-ink-muted", label: "আর্কাইভড" },
  };
  const s = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${s.bg}`}>
      {s.label}
    </span>
  );
}
