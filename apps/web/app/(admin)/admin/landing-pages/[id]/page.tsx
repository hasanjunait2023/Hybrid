import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getLandingPage, getLpAbStats } from "@/lib/admin/landingPages";
import { PageHeader } from "../../_ui";
import { BlockEditor } from "./BlockEditor";

interface Props {
  params: Promise<{ id: string }>;
}

// Landing page block editor (Phase 3 funnel builder + Phase 4 A/B test).
export default async function LandingPageEditPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const { id } = await params;
  const page = await getLandingPage(tenantId, session.userId, id);
  if (!page) notFound();
  const abStats = await getLpAbStats(tenantId, session.userId, page.slug).catch(() => null);

  return (
    <div className="space-y-4">
      <PageHeader
        title={page.title ?? "ল্যান্ডিং পেজ"}
        subtitle={`/${page.slug}`}
        action={
          <a
            href="/admin/landing-pages"
            className="text-sm text-ink-muted hover:text-primary hover:underline"
          >
            ← সব পেজ
          </a>
        }
      />
      <BlockEditor page={page} abStats={abStats ?? undefined} />
    </div>
  );
}
