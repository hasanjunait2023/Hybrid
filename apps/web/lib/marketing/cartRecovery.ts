// O16 — Cart-recovery sweep (sprint 3).
//
// The cron (every 30 minutes, see /api/internal/cart-recovery-sweep) calls
// runCartRecoverySweep(). The sweep:
//
//   1. Lists every cart where:
//        - abandoned_at is set (cart was abandoned)
//        - recovered_at is NULL (customer hasn't bought yet)
//        - recovery_attempts < 3 (we only send up to 3 nudges per O16 spec)
//        - last_reminder_at is NULL or older than the next nudge delay
//      and tenant has sms_cart_recovery_enabled = true
//   2. For each candidate cart, computes the next nudge attempt (1, 2, 3)
//      from the tenant's sms_cart_recovery_hours list ([1, 24, 72] default)
//      and the cart's abandoned_at + recovery_attempts.
//   3. Enqueues an SMS (non-blocking) and stamps:
//        cart.recovery_attempts = attempt
//        cart.last_reminder_at  = now()
//        cart_reminder (audit row)
//
// Concurrency: asPlatformAdmin scan + per-cart withTenant work. The
// cart_recovery_pending_idx partial index keeps the scan cheap.
//
// Idempotency: the (cart_id, channel, template_key) UNIQUE on cart_reminder
// prevents double-sends on cron overlap. The first attempt writes
// 'cart_recovery_1h', the second 'cart_recovery_24h', etc — the audit
// log doubles as the dedup key.
//
// Failure-mode: one bad cart never aborts the sweep. Each cart is its own
// try/catch and the run tallies errors + continues.

import { asPlatformAdmin, withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { enqueueCartRecoverySms } from "@/lib/sms/queue";
import { logSms } from "@/lib/comm/log";

/** Default cadence in hours per O16 spec. */
const DEFAULT_RECOVERY_HOURS: number[] = [1, 24, 72];

/** Hard cap on total nudges per cart. */
const MAX_RECOVERY_ATTEMPTS = 3;

interface AbandonedCartRow {
  id: string;
  tenant_id: string;
  phone: string | null;
  recovery_token: string | null;
  abandoned_at: Date;
  recovery_attempts: number;
  last_reminder_at: Date | null;
  sms_enabled: boolean;
  sms_hours: number[] | null;
  slug: string | null;
}

export interface CartRecoverySweepInput {
  /** Caller-supplied "now" so tests are deterministic. */
  now: Date;
}

export interface CartRecoverySweepResult {
  scanned: number;
  notified: number;
  skipped: number;
  errors: number;
  thresholdHours: number[];
}

export async function runCartRecoverySweep(
  input: CartRecoverySweepInput,
): Promise<CartRecoverySweepResult> {
  const now = input.now;
  const result: CartRecoverySweepResult = {
    scanned: 0,
    notified: 0,
    skipped: 0,
    errors: 0,
    thresholdHours: DEFAULT_RECOVERY_HOURS,
  };

  let candidates: AbandonedCartRow[] = [];
  try {
    candidates = await asPlatformAdmin((tx) =>
      tx<AbandonedCartRow[]>`
        select
          c.id,
          c.tenant_id,
          c.phone,
          c.recovery_token,
          c.abandoned_at,
          c.recovery_attempts,
          c.last_reminder_at,
          t.sms_cart_recovery_enabled as sms_enabled,
          t.sms_cart_recovery_hours  as sms_hours,
          t.slug
        from cart c
        join tenant t on t.id = c.tenant_id
        where c.abandoned_at is not null
          and c.recovered_at is null
          and c.recovery_attempts < ${MAX_RECOVERY_ATTEMPTS}
          and c.phone is not null
          and c.recovery_token is not null
          and t.sms_cart_recovery_enabled = true
          and (
            c.last_reminder_at is null
            or c.last_reminder_at <= ${now.toISOString()}::timestamptz
          )
        order by c.abandoned_at asc
        limit 500
      `,
    );
  } catch (err) {
    console.warn("[cart-recovery] scan failed:", err);
    result.errors += 1;
    return result;
  }

  result.scanned = candidates.length;
  if (candidates.length > 0) {
    console.warn(
      `[cart-recovery] scanned ${result.scanned} abandoned cart(s) at ${now.toISOString()}`,
    );
  }

  for (const row of candidates) {
    try {
      const hours = Array.isArray(row.sms_hours) && row.sms_hours.length > 0
        ? row.sms_hours
        : DEFAULT_RECOVERY_HOURS;
      const nextAttempt = (row.recovery_attempts ?? 0) + 1;
      if (nextAttempt > hours.length) {
        result.skipped += 1;
        continue;
      }
      const targetDelayHours = hours[nextAttempt - 1] ?? hours[hours.length - 1] ?? 1;
      const target = new Date(
        new Date(row.abandoned_at).getTime() + targetDelayHours * 3_600_000,
      );
      if (target > now) {
        // Not yet time for this attempt — sweep leaves it for next pass.
        result.skipped += 1;
        continue;
      }
      // Build the recovery URL from the tenant slug + the per-cart
      // token. Tenants with a single-word slug get the subdomain form;
      // the platform apex serves tenants without a slug.
      const host = row.slug
        ? `https://${row.slug}.hybrid.ecomex.cloud`
        : "https://hybrid.ecomex.cloud";
      const recoveryUrl = `${host}/cart/recover/${row.recovery_token}`;

      await withTenant(row.tenant_id, null, async (tx: Tx) => {
        // Stamp the cart first so a concurrent sweep sees the increment
        // and skips this row on the next pass.
        await tx`
          update cart
             set recovery_attempts = ${nextAttempt},
                 last_reminder_at  = ${now},
                 updated_at        = now()
           where id = ${row.id}
        `;
        // Audit row — the (cart_id, channel, template_key) UNIQUE on
        // cart_reminder doubles as our dedup key.
        const templateKey = `cart_recovery_${targetDelayHours}h`;
        await tx`
          insert into cart_reminder (tenant_id, cart_id, channel, template_key, sent_at, status)
          values (${row.tenant_id}, ${row.id}, 'sms', ${templateKey}, ${now}, 'queued')
          on conflict (cart_id, channel, template_key) do nothing
        `;
      });

      // Fire the SMS. NON-blocking — a queue failure here must never
      // roll back the attempt counter (the customer can be re-nudged
      // after the next cron pass). We log best-effort.
      enqueueCartRecoverySms({
        cartId: row.id,
        tenantId: row.tenant_id,
        attempt: Math.min(nextAttempt, 3) as 1 | 2 | 3,
        recoveryUrl,
      })
        .then(() => {
          void logSms({
            tenantId: row.tenant_id,
            customerId: null,
            phone: row.phone ?? "",
            templateKey: `customer.cart.recovery_${nextAttempt}h`,
            body: `[recovery URL: ${recoveryUrl}]`,
            status: "sent",
            error: undefined,
          }).catch(() => undefined);
        })
        .catch((err) =>
          console.warn(
            `[cart-recovery] enqueue SMS failed for cart ${row.id}:`,
            err,
          ),
        );
      result.notified += 1;
    } catch (err) {
      result.errors += 1;
      console.warn(
        `[cart-recovery] cart ${row.id} (tenant ${row.tenant_id}) failed:`,
        err,
      );
    }
  }

  if (result.scanned > 0) {
    console.warn(
      `[cart-recovery] done: notified=${result.notified} skipped=${result.skipped} errors=${result.errors}`,
    );
  }
  return result;
}
