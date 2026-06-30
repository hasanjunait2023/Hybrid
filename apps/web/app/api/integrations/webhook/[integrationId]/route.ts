// Public webhook receiver — external platforms POST events here.
// URL pattern: /api/integrations/webhook/{webhook_token}
// (the [integrationId] segment contains the webhook_token, not the UUID)
import { NextRequest, NextResponse } from "next/server";
import { getIntegrationByToken, updateIntegrationStatus } from "@/lib/integrations/data";
import { handleWebhookEvent } from "@/lib/integrations/sync";
import { openIntegrationCredentials } from "@/lib/integrations/data";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId: token } = await params;

  // Look up integration by webhook_token
  const integration = await getIntegrationByToken(token);
  if (!integration) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rawBody = await req.text();

  // Verify HMAC signature if the platform sent one
  if (integration.webhookSecret) {
    const sig =
      req.headers.get("x-shopify-hmac-sha256") ??
      req.headers.get("x-wc-webhook-signature") ??
      req.headers.get("x-hub-signature-256") ??
      "";

    if (sig) {
      const expected = crypto
        .createHmac("sha256", integration.webhookSecret)
        .update(rawBody, "utf8")
        .digest("base64");
      const sigBody = sig.replace(/^sha256=/, "");
      const valid = crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(sigBody.length === expected.length ? sigBody : Buffer.alloc(expected.length).toString("base64")),
      );
      if (!valid) {
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
      }
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const topic =
    (req.headers.get("x-shopify-topic") ??
      req.headers.get("x-wc-webhook-topic") ??
      req.headers.get("x-event-type") ??
      "unknown") as string;

  // Run event handling — fetch credentials from DB
  try {
    // We need credentials to handle bidirectional events (e.g. push back inventory)
    // For import-only webhook events we can proceed without credentials.
    let credentials = "";
    try {
      const { getIntegration } = await import("@/lib/integrations/data");
      const full = await getIntegration(integration.tenantId, null, integration.id);
      if (full?.credentialsSealed) credentials = full.credentialsSealed;
    } catch {
      // Non-fatal — webhook may only need to import, not export
    }

    await handleWebhookEvent(
      integration.id,
      integration.tenantId,
      credentials,
      topic,
      payload,
    );
  } catch (err) {
    console.error(`[webhook] integration=${integration.id} topic=${topic} error:`, err);
    // Don't expose error details to external caller; log internally
    await updateIntegrationStatus(integration.tenantId, integration.id, "error", String(err)).catch(() => {});
    return NextResponse.json({ error: "processing_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Shopify webhook validation also uses GET for webhook creation confirmation
export async function GET() {
  return NextResponse.json({ ok: true });
}
