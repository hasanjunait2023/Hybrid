// Billing bKash callback (tenant roadmap P3-1). bKash redirects the tenant
// owner here after completing (or cancelling) the subscription payment on the
// bKash hosted page. We execute server-side, verify amount, and activate the
// subscription on success. Redirect → /admin/settings/billing?billing=<outcome>.
//
// This is analogous to /api/bkash/callback for ORDER payments but:
//  * Uses platform bKash creds (env vars), not per-tenant payment_account.
//  * Activates a subscription instead of confirming an order.
//  * Redirects to the ADMIN host, not the storefront.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { confirmUpgrade } from "@/lib/billing/subscriptionUpgrade";

function adminBillingUrl(outcome: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const isLocal = root === "lvh.me";
  const port = isLocal ? ":3000" : "";
  const scheme = isLocal ? "http" : "https";
  return `${scheme}://admin.${root}${port}/admin/settings/billing?billing=${outcome}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const paymentID = req.nextUrl.searchParams.get("paymentID");
  const statusHint = req.nextUrl.searchParams.get("status");

  if (!paymentID) {
    return NextResponse.redirect(adminBillingUrl("failed"));
  }

  const result = await confirmUpgrade({
    bkashPaymentId: paymentID,
    statusHint,
  });

  const outcome =
    result.outcome === "activated" || result.outcome === "replayed" ? "activated"
    : result.outcome === "cancelled" ? "cancelled"
    : "failed";

  return NextResponse.redirect(adminBillingUrl(outcome));
}
