// Public webhook receiver — external platforms POST events here.
// URL pattern: /api/integrations/webhook/{webhook_token}
// (the [integrationId] segment contains the webhook_token, not the UUID)
import { NextRequest, NextResponse } from "next/server";
import { getIntegrationByToken, updateIntegrationStatus } from "@/lib/integrations/data";
import { handleWebhookEvent } from "@/lib/integrations/sync";
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

  // Verify HMAC signature when a webhook secret is configured.
  // If the secret is set, a signature header is REQUIRED — no signature = reject.
  if (integration.webhookSecret) {
    // x-hub-signature-256 carries a "sha256=<hex>" prefix and uses hex encoding.
    // Shopify (x-shopify-hmac-sha256) and WooCommerce use raw base64.
    const hubSig   = req.headers.get("x-hub-signature-256");
    const shopSig  = req.headers.get("x-shopify-hmac-sha256");
    const wcSig    = req.headers.get("x-wc-webhook-signature");
    const rawSig   = hubSig ?? shopSig ?? wcSig;

    if (!rawSig) {
      return NextResponse.json({ error: "missing_signature" }, { status: 401 });
    }

    // Strip the "sha256=" prefix used by the hub spec.
    const incoming = rawSig.replace(/^sha256=/, "");
    // Use hex for x-hub-signature-256, base64 for all others.
    const encoding = hubSig ? "hex" : "base64";
    const expected = crypto
      .createHmac("sha256", integration.webhookSecret)
      .update(rawBody, "utf8")
      .digest(encoding);

    if (
      incoming.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(incoming))
    ) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
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
