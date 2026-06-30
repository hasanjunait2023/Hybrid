// Scheduled cron — runs product/inventory/order sync for all active integrations.
// Called by the cron scheduler (same pattern as /api/internal/billing-sweep).
// Protected by CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { listActiveIntegrationsForSync, updateIntegrationStatus } from "@/lib/integrations/data";
import { runProductImport, runInventoryExport, runOrderImport } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max (Vercel Pro / self-hosted generous timeout)

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const integrations = await listActiveIntegrationsForSync();
  if (!integrations.length) return NextResponse.json({ ok: true, count: 0 });

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const integration of integrations) {
    if (!integration.credentials) {
      results.push({ id: integration.id, ok: false, error: "no_credentials" });
      continue;
    }

    try {
      const { entities } = integration.config;

      if (entities.product?.enabled && entities.product.direction !== "export") {
        await runProductImport(integration.id, integration.tenantId, integration.credentials, "scheduled");
      }

      if (entities.inventory?.enabled && entities.inventory.direction !== "import") {
        await runInventoryExport(integration.id, integration.tenantId, integration.credentials, "scheduled");
      }

      if (entities.order?.enabled && entities.order.direction !== "export") {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await runOrderImport(integration.id, integration.tenantId, integration.credentials, "scheduled", oneDayAgo);
      }

      await updateIntegrationStatus(integration.tenantId, integration.id, "active");
      results.push({ id: integration.id, ok: true });
    } catch (err) {
      const msg = String(err);
      await updateIntegrationStatus(integration.tenantId, integration.id, "error", msg).catch(() => {});
      results.push({ id: integration.id, ok: false, error: msg });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({
    ok: true,
    total: results.length,
    succeeded: results.length - failed,
    failed,
    results,
  });
}
