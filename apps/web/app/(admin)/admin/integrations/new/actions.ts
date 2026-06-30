"use server";

import { getSession } from "@/lib/auth/session";
import {
  sealIntegrationCredentials,
  createIntegration,
} from "@/lib/integrations/data";
import { getAdapter } from "@/lib/integrations/adapters";
import { DEFAULT_SYNC_CONFIG } from "@/lib/integrations/types";
import type { PlatformCredentials, IntegrationPlatform } from "@/lib/integrations/types";
import { revalidateTag } from "next/cache";

export interface ConnectResult {
  ok: boolean;
  error?: string;
  integrationId?: string;
}

export async function connectIntegrationAction(formData: FormData): Promise<ConnectResult> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, error: "unauthenticated" };

  const platform = formData.get("platform") as IntegrationPlatform;
  const displayName = (formData.get("display_name") as string | null)?.trim() ?? platform;

  let creds: PlatformCredentials;
  try {
    creds = buildCredentials(platform, formData);
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  // Test connection before persisting
  try {
    const adapter = getAdapter(creds);
    await adapter.testConnection();
  } catch (err) {
    return { ok: false, error: `সংযোগ পরীক্ষা ব্যর্থ: ${String(err)}` };
  }

  const sealed = sealIntegrationCredentials(creds);
  const integration = await createIntegration(
    session.tenantId,
    session.userId,
    platform,
    displayName,
    sealed,
    DEFAULT_SYNC_CONFIG,
  );

  // Immediately set status to active (test passed)
  const { updateIntegrationStatus } = await import("@/lib/integrations/data");
  await updateIntegrationStatus(session.tenantId, integration.id, "active");

  revalidateTag(`tenant:${session.tenantId}`);
  return { ok: true, integrationId: integration.id };
}

export async function testConnectionAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, error: "unauthenticated" };

  const platform = formData.get("platform") as IntegrationPlatform;
  let creds: PlatformCredentials;
  try {
    creds = buildCredentials(platform, formData);
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  try {
    const adapter = getAdapter(creds);
    await adapter.testConnection();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function buildCredentials(platform: IntegrationPlatform, form: FormData): PlatformCredentials {
  if (platform === "shopify") {
    const shop_url = (form.get("shop_url") as string | null)?.trim() ?? "";
    const access_token = (form.get("access_token") as string | null)?.trim() ?? "";
    if (!shop_url || !access_token) throw new Error("Shopify shop_url এবং access_token প্রয়োজন।");
    return { platform: "shopify", shop_url, access_token };
  }

  if (platform === "woocommerce") {
    const site_url = (form.get("site_url") as string | null)?.trim() ?? "";
    const consumer_key = (form.get("consumer_key") as string | null)?.trim() ?? "";
    const consumer_secret = (form.get("consumer_secret") as string | null)?.trim() ?? "";
    if (!site_url || !consumer_key || !consumer_secret) {
      throw new Error("WooCommerce site_url, consumer_key, এবং consumer_secret প্রয়োজন।");
    }
    return { platform: "woocommerce", site_url, consumer_key, consumer_secret };
  }

  if (platform === "custom_api") {
    const base_url = (form.get("base_url") as string | null)?.trim() ?? "";
    const auth_type = (form.get("auth_type") as "bearer" | "basic" | "api_key" | "none") ?? "none";
    if (!base_url) throw new Error("Custom API base_url প্রয়োজন।");
    return {
      platform: "custom_api",
      base_url,
      auth_type,
      token: (form.get("token") as string | null)?.trim() || undefined,
      username: (form.get("username") as string | null)?.trim() || undefined,
      password: (form.get("password") as string | null)?.trim() || undefined,
      api_key_header: (form.get("api_key_header") as string | null)?.trim() || undefined,
      api_key_value: (form.get("api_key_value") as string | null)?.trim() || undefined,
      endpoints: {
        products: (form.get("ep_products") as string | null)?.trim() || undefined,
        inventory: (form.get("ep_inventory") as string | null)?.trim() || undefined,
        orders: (form.get("ep_orders") as string | null)?.trim() || undefined,
      },
    };
  }

  if (platform === "webhook_only") {
    return {
      platform: "webhook_only",
      incoming_secret: (form.get("incoming_secret") as string | null)?.trim() || undefined,
    };
  }

  throw new Error("অজানা প্ল্যাটফর্ম।");
}
