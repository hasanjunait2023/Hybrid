// bKash tokenized callback (blueprint S-CHECKOUT; research §1).
//
// The popup redirects the browser here with ?paymentID&status after the buyer
// approves/cancels. We do NOT trust the status param — processBkashCallback
// executes (and, if lost, queries) server-side, guarded by the webhook_event
// replay lock, then flips payment + order statuses inside withTenant. On a
// successful first-time process we fire the post-commit SMS (non-blocking).
//
// After processing we redirect the buyer to the storefront order page:
//   success/replayed → /order/{orderNumber}      (the success/track page)
//   failed/cancelled → /checkout?payment=failed  (back to retry / pick COD)
// The redirect stays on the originating storefront host (the callbackURL host),
// so the buyer lands back on their store, not the API host.
import { NextResponse, type NextRequest } from "next/server";
import { processBkashCallback } from "@/lib/payments/callback";
import { getEnabledBkash } from "@/lib/payments/bkash";
import { sendOrderNotifications } from "@/lib/sms/notify";
import { withTenant } from "@hybrid/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const paymentId = req.nextUrl.searchParams.get("paymentID");
  const status = req.nextUrl.searchParams.get("status");
  const origin = req.nextUrl.origin;

  if (!paymentId) {
    return NextResponse.redirect(new URL("/checkout?payment=invalid", origin));
  }

  const result = await processBkashCallback({
    paymentId,
    status,
    getProvider: getEnabledBkash,
    onPaid: async (ctx) => {
      // Look up the store name + hotline for the templates; non-blocking.
      const store = await withTenant(ctx.tenantId, null, (tx) =>
        tx<{ name: string; settings: { contact?: { phone?: string } } | null }[]>`
          select name, settings from tenant where id = ${ctx.tenantId} limit 1
        `,
      );
      const storeName = store[0]?.name ?? "";
      const sellerPhone = store[0]?.settings?.contact?.phone ?? null;
      await sendOrderNotifications({
        storeName,
        orderNumber: ctx.orderNumber,
        total: ctx.total,
        paymentMethod: "bkash",
        customerName: ctx.customerName,
        customerPhone: ctx.customerPhone,
        sellerPhone,
      });
    },
  });

  if (result.outcome === "unknown") {
    return NextResponse.redirect(new URL("/checkout?payment=failed", origin));
  }

  if ((result.outcome === "paid" || result.outcome === "replayed") && result.orderNumber != null) {
    return NextResponse.redirect(new URL(`/order/${result.orderNumber}`, origin));
  }

  // failed / cancelled — back to checkout to retry or switch to COD.
  return NextResponse.redirect(new URL("/checkout?payment=failed", origin));
}
