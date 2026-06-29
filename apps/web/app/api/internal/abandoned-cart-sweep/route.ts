// Abandoned-cart recovery cron (P3). CRON_SECRET-guarded internal route.
//
// Runs once per hour (or on demand). For each active tenant:
//   1. Finds carts abandoned > 1h ago that haven't received the first SMS.
//   2. Finds carts > 24h ago that received the first SMS but not the follow-up.
//   3. Sends SMS (via the tenant's SMS adapter) and records in cart_reminder.
//
// Uses asPlatformAdmin to list tenants (cross-tenant read). Per-tenant cart
// work goes through processAbandonedCarts which uses withTenant(tenantId, null)
// since the cart/cart_reminder RLS policies only gate on tenant_id, not user_id.
// (userId=null is fine: RLS checks app.current_tenant_id(), set by withTenant.)
//
// Secret handling mirrors billing-sweep: fail-closed when CRON_SECRET is unset.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asPlatformAdmin } from "@hybrid/db";
import { processAbandonedCarts } from "@/lib/marketing/abandoned-cart";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hybrid.ecomex.cloud";

  // List all active tenants with enough info to build per-tenant recovery config.
  const tenants = await asPlatformAdmin((tx) =>
    tx<{ id: string; slug: string; name: string }[]>`
      select t.id, t.slug, t.name
        from tenant t
       where t.status in ('active', 'trial', 'past_due')
       order by t.created_at
    `,
  );

  const summary: { tenantId: string; firstSent: number; followUpSent: number; error?: string }[] = [];

  for (const tenant of tenants) {
    try {
      const result = await processAbandonedCarts(tenant.id, null, {
        locale: "bn",
        brandName: tenant.name,
        recoveryUrlBase: `https://${tenant.slug}.${rootDomain}/cart`,
        followUpDiscountPct: 0,
      });
      summary.push({
        tenantId: tenant.id,
        firstSent: result.firstRemindersSent,
        followUpSent: result.followUpRemindersSent,
      });
    } catch (err) {
      summary.push({
        tenantId: tenant.id,
        firstSent: 0,
        followUpSent: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalFirst = summary.reduce((s, r) => s + r.firstSent, 0);
  const totalFollowUp = summary.reduce((s, r) => s + r.followUpSent, 0);
  const errors = summary.filter((r) => r.error).length;

  return NextResponse.json({
    ok: true,
    tenantsChecked: tenants.length,
    firstRemindersSent: totalFirst,
    followUpRemindersSent: totalFollowUp,
    errors,
  });
}
