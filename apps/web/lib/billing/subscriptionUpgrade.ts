// Self-serve subscription upgrade via bKash (tenant roadmap P3-1). Platform
// bKash credentials come from env vars (PLATFORM_BKASH_*) — distinct from the
// per-tenant bKash credentials stored in payment_account, which receive payments
// from end-customers. Here the platform RECEIVES subscription fees from tenants.
//
// Flow:
//   1. initiateUpgrade()   — create draft invoice + bKash create-payment → return bkashURL
//   2. confirmUpgrade()    — called from the /api/billing/bkash/callback route after
//                           execute+verify: mark invoice paid, activate subscription.
//
// All DB writes run under asPlatformAdmin (invoice/subscription are platform-
// visible tables). Tenant identity is carried by the invoice.tenant_id.
import "server-only";
import { asPlatformAdmin } from "@hybrid/db";
import { BkashProvider } from "@hybrid/payments";
import type { ProviderCreds } from "@hybrid/payments";
import { getCache } from "@/lib/redis/client";

// ── Platform bKash credentials ────────────────────────────────────────────────

function getPlatformBkashCreds(): ProviderCreds | null {
  const { PLATFORM_BKASH_USERNAME, PLATFORM_BKASH_PASSWORD, PLATFORM_BKASH_APP_KEY, PLATFORM_BKASH_APP_SECRET, PLATFORM_BKASH_MODE } = process.env;
  if (!PLATFORM_BKASH_USERNAME || !PLATFORM_BKASH_PASSWORD || !PLATFORM_BKASH_APP_KEY || !PLATFORM_BKASH_APP_SECRET) {
    return null;
  }
  return {
    mode: PLATFORM_BKASH_MODE === "live" ? "live" : "sandbox",
    username: PLATFORM_BKASH_USERNAME,
    password: PLATFORM_BKASH_PASSWORD,
    appKey: PLATFORM_BKASH_APP_KEY,
    appSecret: PLATFORM_BKASH_APP_SECRET,
  };
}

const PLATFORM_BKASH_TOKEN_KEY = "bkash:token:platform";

function getPlatformBkashProvider(): BkashProvider {
  const cache = getCache();
  return new BkashProvider({
    fetch: globalThis.fetch,
    tokenStore: {
      get: (key) => cache.get(key),
      set: (key, value, ttl) => cache.set(key, value, ttl),
    },
    tokenCacheKey: PLATFORM_BKASH_TOKEN_KEY,
  });
}

// Construct the callback URL for billing. Uses the platform host (app.{root}) so
// the bKash gateway callback lands on the platform app, not a tenant storefront.
function billingCallbackUrl(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const isLocal = root === "lvh.me";
  const port = process.env.PORT ? `:${process.env.PORT}` : isLocal ? ":3000" : "";
  const scheme = isLocal ? "http" : "https";
  return `${scheme}://app.${root}${port}/api/billing/bkash/callback`;
}

// ── Draft invoice + payment creation ─────────────────────────────────────────

export interface InitiateUpgradeInput {
  tenantId: string;
  planId: string;
  planName: string;
  priceBdt: number;
  tenantPhone: string; // bKash payer reference (tenant owner's phone)
}

export type InitiateUpgradeResult =
  | { ok: true; bkashURL: string; invoiceId: string }
  | { ok: false; error: string };

export async function initiateUpgrade(input: InitiateUpgradeInput): Promise<InitiateUpgradeResult> {
  const creds = getPlatformBkashCreds();
  if (!creds) {
    return { ok: false, error: "বিলিং পেমেন্ট এই মুহূর্তে উপলব্ধ নয়। support@hybrid.ecomex.cloud -এ যোগাযোগ করুন।" };
  }

  // Create a draft invoice for this upgrade. If a draft already exists for the
  // same tenant + plan, reuse it (idempotent click protection).
  const invoiceId = await asPlatformAdmin(async (tx) => {
    const existing = await tx<{ id: string }[]>`
      select id from invoice
      where tenant_id = ${input.tenantId}
        and status = 'open'
        and provider = 'bkash'
        and provider_ref is null
      limit 1
    `;
    if (existing[0]) return existing[0].id;

    const ins = await tx<{ id: string }[]>`
      insert into invoice (tenant_id, amount, status, provider, due_at)
      values (${input.tenantId}, ${input.priceBdt}, 'open', 'bkash', now() + interval '1 hour')
      returning id
    `;
    return ins[0]!.id;
  });

  const provider = getPlatformBkashProvider();
  let created;
  try {
    created = await provider.createPayment(
      {
        amount: String(input.priceBdt),
        currency: "BDT",
        merchantInvoiceNumber: invoiceId,
        payerReference: input.tenantPhone,
        callbackURL: billingCallbackUrl(),
      },
      creds,
    );
  } catch (err) {
    console.error("[billing-bkash] createPayment failed:", err);
    return { ok: false, error: "পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
  }

  if (!created.paymentId || !created.redirectUrl) {
    return { ok: false, error: "পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" };
  }

  // Bind bKash paymentID + target plan to the invoice so the callback can resolve it.
  await asPlatformAdmin(async (tx) => {
    await tx`
      update invoice
         set provider_ref = ${created.paymentId},
             invoice_number = ${input.planName}
       where id = ${invoiceId}
    `;
  });

  return { ok: true, bkashURL: created.redirectUrl, invoiceId };
}

// ── Callback: verify + activate ───────────────────────────────────────────────

export interface BillingCallbackInput {
  bkashPaymentId: string;
  statusHint?: string | null;
}

export type BillingCallbackOutcome = "activated" | "failed" | "cancelled" | "replayed" | "unknown";

export interface BillingCallbackResult {
  outcome: BillingCallbackOutcome;
  tenantId: string | null;
}

export async function confirmUpgrade(input: BillingCallbackInput): Promise<BillingCallbackResult> {
  // Look up the invoice by bKash paymentID.
  const invoice = await asPlatformAdmin((tx) =>
    tx<{ id: string; tenant_id: string; amount: string; status: string }[]>`
      select id, tenant_id, amount, status
      from invoice
      where provider = 'bkash' and provider_ref = ${input.bkashPaymentId}
      limit 1
    `,
  );
  const inv = invoice[0];
  if (!inv) return { outcome: "unknown", tenantId: null };
  if (inv.status === "paid") return { outcome: "replayed", tenantId: inv.tenant_id };

  const creds = getPlatformBkashCreds();
  if (!creds) return { outcome: "failed", tenantId: inv.tenant_id };

  const provider = getPlatformBkashProvider();

  // Execute the payment (server-side authoritative).
  let state: string;
  let chargedAmount: string | undefined;
  let trxId: string | undefined;
  try {
    const executed = await provider.executePayment({ paymentId: input.bkashPaymentId }, creds);
    state = executed.state;
    chargedAmount = executed.amount;
    trxId = executed.trxId;

    if (state !== "success") {
      // Safety net: fall back to query.
      const queried = await provider.queryPayment({ paymentId: input.bkashPaymentId }, creds);
      if (queried.state === "success") {
        state = queried.state;
        chargedAmount = queried.amount ?? chargedAmount;
        trxId = queried.trxId ?? trxId;
      }
    }
  } catch (err) {
    console.error("[billing-bkash] execute/query failed:", err);
    return { outcome: "failed", tenantId: inv.tenant_id };
  }

  const expectedMinor = Math.round(Number(inv.amount) * 100);
  const chargedMinor = chargedAmount != null ? Math.round(Number(chargedAmount) * 100) : -1;
  if (state === "success" && chargedMinor !== expectedMinor) {
    console.error(`[billing-bkash] amount mismatch: charged=${chargedAmount} expected=${inv.amount}`);
    state = "failed";
  }

  if (state !== "success") {
    return {
      outcome: input.statusHint === "cancel" ? "cancelled" : "failed",
      tenantId: inv.tenant_id,
    };
  }

  // Find the plan the invoice was for (invoice_number stores the plan name;
  // resolve the plan id from the plan table).
  const planRows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`
      select p.id from plan p
      join invoice i on i.invoice_number = p.name
      where i.id = ${inv.id}
      limit 1
    `,
  );
  const planId = planRows[0]?.id ?? null;

  // Activate subscription + mark invoice paid in one admin transaction.
  await asPlatformAdmin(async (tx) => {
    // Update invoice to paid.
    await tx`
      update invoice
         set status = 'paid',
             paid_at = now(),
             updated_at = now()
       where id = ${inv.id}
    `;

    if (planId) {
      // Upsert subscription: activate for 1 month from today.
      await tx`
        insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end, billing_provider)
        values (
          ${inv.tenant_id}, ${planId}, 'active',
          now(),
          now() + interval '1 month',
          'bkash'
        )
        on conflict (tenant_id)
        where status in ('trialing','active','past_due')
        do update set
          plan_id               = excluded.plan_id,
          status                = 'active',
          current_period_start  = excluded.current_period_start,
          current_period_end    = excluded.current_period_end,
          billing_provider      = 'bkash',
          updated_at            = now()
      `;

      // Sync tenant.plan_id so checkPlanLimit reads the new limits immediately.
      await tx`
        update tenant set plan_id = ${planId}, updated_at = now()
        where id = ${inv.tenant_id}
      `;
    }
  });

  return { outcome: "activated", tenantId: inv.tenant_id };
}
