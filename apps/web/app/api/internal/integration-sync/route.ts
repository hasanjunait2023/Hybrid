// Scheduled cron — runs product/inventory/order sync for all active integrations.
// Called by the cron scheduler (same pattern as /api/internal/billing-sweep).
// Protected by CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { listActiveIntegrationsForSync, updateIntegrationStatus } from "@/lib/integrations/data";
import { runProductImport, runInventoryExport, runOrderImport } from "@/lib/integrations/sync";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max (Vercel Pro / self-hosted generous timeout)

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  // Secret must come from the Authorization header only — never from a URL query
  // param which would leak into access logs, proxy logs, and CDN edge caches.
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!cronSecret || !secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Timing-safe compare prevents timing-oracle attacks on the secret value.
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(secret);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
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
