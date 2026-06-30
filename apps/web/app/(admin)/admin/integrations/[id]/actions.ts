"use server";

import { getSession } from "@/lib/auth/session";
import {
  getIntegration,
  updateIntegrationStatus,
  updateIntegrationConfig,
  deleteIntegration,
} from "@/lib/integrations/data";
import { runProductImport, runInventoryExport, runOrderImport } from "@/lib/integrations/sync";
import type { SyncConfig } from "@/lib/integrations/types";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

export async function syncNowAction(
  integrationId: string,
  entity: "product" | "inventory" | "order",
): Promise<{ ok: boolean; synced?: number; failed?: number; error?: string }> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, error: "unauthenticated" };

  const integration = await getIntegration(session.tenantId, session.userId, integrationId);
  if (!integration) return { ok: false, error: "ইন্টিগ্রেশন পাওয়া যায়নি" };
  if (!integration.credentialsSealed) return { ok: false, error: "কোনো ক্রেডেনশিয়াল নেই" };

  try {
    let result: { synced: number; failed: number };
    if (entity === "product") {
      result = await runProductImport(integrationId, session.tenantId, integration.credentialsSealed, "manual");
    } else if (entity === "inventory") {
      result = await runInventoryExport(integrationId, session.tenantId, integration.credentialsSealed, "manual");
    } else {
      result = await runOrderImport(integrationId, session.tenantId, integration.credentialsSealed, "manual");
    }
    revalidateTag(`tenant:${session.tenantId}:products`);
    revalidateTag(`tenant:${session.tenantId}:orders`);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function updateConfigAction(
  integrationId: string,
  config: SyncConfig,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, error: "unauthenticated" };

  try {
    await updateIntegrationConfig(session.tenantId, session.userId, integrationId, config);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function pauseIntegrationAction(integrationId: string): Promise<void> {
  const session = await getSession();
  if (!session?.tenantId) return;
  await updateIntegrationStatus(session.tenantId, integrationId, "paused");
  revalidateTag(`tenant:${session.tenantId}`);
}

export async function resumeIntegrationAction(integrationId: string): Promise<void> {
  const session = await getSession();
  if (!session?.tenantId) return;
  await updateIntegrationStatus(session.tenantId, integrationId, "active");
  revalidateTag(`tenant:${session.tenantId}`);
}

export async function deleteIntegrationAction(integrationId: string): Promise<void> {
  const session = await getSession();
  if (!session?.tenantId) return;
  await deleteIntegration(session.tenantId, session.userId, integrationId);
  revalidateTag(`tenant:${session.tenantId}`);
  redirect("/admin/integrations");
}
