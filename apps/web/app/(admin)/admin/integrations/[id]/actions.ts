"use server";

import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
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

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "unauthenticated" };
  return { ok: true, tenantId, userId: session.userId };
}

export async function syncNowAction(
  integrationId: string,
  entity: "product" | "inventory" | "order",
): Promise<{ ok: boolean; synced?: number; failed?: number; error?: string }> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };

  const integration = await getIntegration(auth.tenantId, auth.userId, integrationId);
  if (!integration) return { ok: false, error: "ইন্টিগ্রেশন পাওয়া যায়নি" };
  if (!integration.credentialsSealed) return { ok: false, error: "কোনো ক্রেডেনশিয়াল নেই" };

  try {
    let result: { synced: number; failed: number };
    if (entity === "product") {
      result = await runProductImport(integrationId, auth.tenantId, integration.credentialsSealed, "manual");
    } else if (entity === "inventory") {
      result = await runInventoryExport(integrationId, auth.tenantId, integration.credentialsSealed, "manual");
    } else {
      result = await runOrderImport(integrationId, auth.tenantId, integration.credentialsSealed, "manual");
    }
    revalidateTag(`tenant:${auth.tenantId}:products`);
    revalidateTag(`tenant:${auth.tenantId}:orders`);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function updateConfigAction(
  integrationId: string,
  config: SyncConfig,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    await updateIntegrationConfig(auth.tenantId, auth.userId, integrationId, config);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function pauseIntegrationAction(integrationId: string): Promise<void> {
  const auth = await authTenant();
  if (!auth.ok) return;
  await updateIntegrationStatus(auth.tenantId, integrationId, "paused");
  revalidateTag(`tenant:${auth.tenantId}`);
}

export async function resumeIntegrationAction(integrationId: string): Promise<void> {
  const auth = await authTenant();
  if (!auth.ok) return;
  await updateIntegrationStatus(auth.tenantId, integrationId, "active");
  revalidateTag(`tenant:${auth.tenantId}`);
}

export async function deleteIntegrationAction(integrationId: string): Promise<void> {
  const auth = await authTenant();
  if (!auth.ok) return;
  await deleteIntegration(auth.tenantId, auth.userId, integrationId);
  revalidateTag(`tenant:${auth.tenantId}`);
  redirect("/admin/integrations");
}
