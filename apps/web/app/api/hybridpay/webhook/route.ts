// Hybrid Pay callback + webhook (single route, two entrypoints).
//
// Hybrid Pay (PipraPay engine) is told, per charge, one URL for BOTH return_url
// (browser redirect after pay) and webhook_url (server-to-server settlement):
//
//   GET  /api/hybridpay/webhook?pp_status=...&transaction_ref=PP123
//        ↑ the BROWSER landing after the hosted page. transaction_ref is the
//          pp_id. Advisory only — we re-verify server-side, then redirect the
//          buyer to their order page.
//   POST /api/hybridpay/webhook   body: { pp_id: "PP123", ... }
//        ↑ the AUTHORITATIVE server webhook. We NEVER trust the body — we
//          re-verify by pp_id (verify-payment) before marking anything paid.
//
// Both funnel through processGatewayCallback(provider:'hybridpay'), which owns
// the idempotent transition: webhook_event replay guard, server-side execute →
// query safety net, paisa-exact amount verification, payment + order status
// flip inside withTenant. A webhook that arrives first and a browser return that
// arrives second (or vice-versa) collapse to one paid transition via the
// webhook_event unique(provider, external_id) lock.
import { NextResponse, type NextRequest } from "next/server";
import { processGatewayCallback, type PaidContext } from "@/lib/payments/callback";
import { getEnabledHybridpay } from "@/lib/payments/hybridpay";
import { sendOrderNotifications } from "@/lib/sms/notify";
import { withTenant } from "@hybrid/db";

export const runtime = "nodejs";

// Post-commit SMS (store name + hotline for the templates). Non-blocking; the
// processor calls this only on a first-time paid transition.
async function notifyPaid(ctx: PaidContext): Promise<void> {
  const store = await withTenant(ctx.tenantId, null, (tx) =>
    tx<{ name: string; settings: { contact?: { phone?: string } } | null }[]>`
      select name, settings from tenant where id = ${ctx.tenantId} limit 1
    `,
  );
  await sendOrderNotifications({
    tenantId: ctx.tenantId,
    storeName: store[0]?.name ?? "",
    orderNumber: ctx.orderNumber,
    total: ctx.total,
    paymentMethod: "hybridpay",
    customerName: ctx.customerName,
    customerPhone: ctx.customerPhone,
    sellerPhone: store[0]?.settings?.contact?.phone ?? null,
  });
}

// Browser return: verify, then redirect the buyer back to their storefront.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ppId = req.nextUrl.searchParams.get("transaction_ref");
  const status = req.nextUrl.searchParams.get("pp_status");
  const origin = req.nextUrl.origin;

  if (!ppId) {
    return NextResponse.redirect(new URL("/checkout?payment=invalid", origin));
  }

  const result = await processGatewayCallback({
    provider: "hybridpay",
    paymentId: ppId,
    status,
    getProvider: getEnabledHybridpay,
    onPaid: notifyPaid,
  });

  if ((result.outcome === "paid" || result.outcome === "replayed") && result.orderNumber != null) {
    return NextResponse.redirect(new URL(`/order/${result.orderNumber}`, origin));
  }
  // unknown / failed / cancelled — back to checkout to retry or switch to COD.
  return NextResponse.redirect(new URL("/checkout?payment=failed", origin));
}

// Server webhook: verify, mark paid, ack with 200 so Hybrid Pay stops retrying.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let ppId: string | null = null;
  try {
    const body = (await req.json()) as { pp_id?: string };
    ppId = body.pp_id ?? null;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!ppId) {
    return NextResponse.json({ error: "pp_id required" }, { status: 400 });
  }

  const result = await processGatewayCallback({
    provider: "hybridpay",
    paymentId: ppId,
    getProvider: getEnabledHybridpay,
    onPaid: notifyPaid,
  });

  // Always 200 once we've processed (incl. replayed/failed) so the gateway marks
  // the webhook delivered; the outcome is recorded on our payment/webhook_event.
  return NextResponse.json({ received: true, outcome: result.outcome });
}
