import { getSession } from "@/lib/auth/session";
import { redirect, notFound } from "next/navigation";
import { getIntegration, listSyncLogs } from "@/lib/integrations/data";
import { SyncDashboard } from "./SyncDashboard";

export const dynamic = "force-dynamic";

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect("/dev-login");

  const { id } = await params;
  const [integration, logs] = await Promise.all([
    getIntegration(session.tenantId, session.userId, id),
    listSyncLogs(session.tenantId, session.userId, id, 20),
  ]);

  if (!integration) notFound();

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hybrid.ecomex.cloud";
  const webhookUrl = `https://${rootDomain}/api/integrations/webhook/${integration.webhookToken}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <a href="/admin/integrations" className="text-sm text-ink-muted hover:text-ink">
          ← ইন্টিগ্রেশন তালিকা
        </a>
      </div>
      <SyncDashboard
        integration={integration}
        logs={logs}
        webhookUrl={webhookUrl}
      />
    </div>
  );
}
