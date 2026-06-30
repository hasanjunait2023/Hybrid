// R7 — Low-stock alert sweep (sprint 3).
//
// The cron (every 30 minutes) calls runStockAlertSweep(). The sweep:
//
//   1. For each tenant with stock_alert_enabled = true, find variants
//      where:
//        - track_inventory = true
//        - inventory_quantity <= COALESCE(variant.low_stock_threshold,
//          tenant.stock_alert_default_threshold)
//        - last_low_stock_alert_at is NULL OR older than 24h (dedup)
//      indexed via the partial index product_variant_low_stock_idx.
//   2. For each variant, fan out one SMS per phone in
//      tenant.stock_alert_recipients (falling back to the owner's
//      phone when the array is empty).
//   3. Stamp last_low_stock_alert_at = now() so a re-run in 30 minutes
//      doesn't double-fire.
//
// One bad variant never aborts the sweep. The run tallies errors.

import { asPlatformAdmin, withTenant } from "@hybrid/db";
import { merchantLowStockSms } from "@/lib/sms/templates";
import { getSmsAdapter } from "@/lib/sms/index";
import { logSms } from "@/lib/comm/log";

/** Hard cooldown so a stuck-low variant doesn't spam the merchant. */
const COOLDOWN_HOURS = 24;

interface LowStockRow {
  id: string;
  tenant_id: string;
  inventory_quantity: number;
  product_title: string;
  variant_threshold: number | null;
  tenant_default_threshold: number;
  recipients: string[];
  owner_phone: string | null;
  store_name: string;
}

export interface StockAlertSweepInput {
  /** Caller-supplied "now" so tests are deterministic. */
  now: Date;
}

export interface StockAlertSweepResult {
  scanned: number;
  notified: number;
  skipped: number;
  errors: number;
  cooldownHours: number;
}

export async function runStockAlertSweep(
  input: StockAlertSweepInput,
): Promise<StockAlertSweepResult> {
  const now = input.now;
  const result: StockAlertSweepResult = {
    scanned: 0,
    notified: 0,
    skipped: 0,
    errors: 0,
    cooldownHours: COOLDOWN_HOURS,
  };

  let rows: LowStockRow[] = [];
  try {
    rows = await asPlatformAdmin((tx) =>
      tx<LowStockRow[]>`
        select
          v.id,
          v.tenant_id,
          v.inventory_quantity,
          p.title as product_title,
          v.low_stock_threshold as variant_threshold,
          t.stock_alert_default_threshold as tenant_default_threshold,
          t.stock_alert_recipients as recipients,
          owner.phone as owner_phone,
          t.name as store_name
        from product_variant v
        join product p on p.id = v.product_id
        join tenant t on t.id = v.tenant_id
        left join app_user owner on owner.id = t.owner_user_id
        where v.track_inventory = true
          and t.stock_alert_enabled = true
          and v.inventory_quantity <= coalesce(
            v.low_stock_threshold,
            t.stock_alert_default_threshold,
            5
          )
          and (v.last_low_stock_alert_at is null
               or v.last_low_stock_alert_at < ${now.toISOString()}::timestamptz - (${COOLDOWN_HOURS} || ' hours')::interval)
        order by v.inventory_quantity asc
        limit 500
      `,
    );
  } catch (err) {
    console.warn("[stock-alert] scan failed:", err);
    result.errors += 1;
    return result;
  }

  result.scanned = rows.length;
  if (rows.length > 0) {
    console.warn(
      `[stock-alert] scanned ${result.scanned} low-stock variant(s) at ${now.toISOString()}`,
    );
  }

  for (const row of rows) {
    try {
      // Determine the recipient list: explicit array wins, else owner.
      let recipients = row.recipients ?? [];
      if (recipients.length === 0 && row.owner_phone) {
        recipients = [row.owner_phone];
      }
      if (recipients.length === 0) {
        result.skipped += 1;
        continue;
      }

      const threshold = row.variant_threshold ?? row.tenant_default_threshold ?? 5;
      const message = merchantLowStockSms({
        storeName: row.store_name,
        productTitle: row.product_title,
        currentStock: row.inventory_quantity,
        threshold,
      });

      // Stamp the alert timestamp first so a sweep that crashes mid-SMS
      // doesn't re-fire on the next pass (we'd rather miss one
      // notification than double-fire).
      await withTenant(row.tenant_id, null, async (tx) => {
        await tx`
          update product_variant
             set last_low_stock_alert_at = ${now}
           where id = ${row.id}
        `;
      });

      // Fire SMS to each recipient. Non-blocking — a gateway hiccup
      // never rolls back the timestamp stamp.
      const sms = getSmsAdapter();
      for (const phone of recipients) {
        const sent = await sms.send(phone, message).catch((err) => ({
          ok: false as const,
          error: err instanceof Error ? err.message : "send failed",
        }));
        const sendOk = sent.ok === true;
        void logSms({
          tenantId: row.tenant_id,
          customerId: null,
          phone,
          templateKey: "merchant.stock.low",
          body: message,
          status: sendOk ? "sent" : "failed",
          error: sendOk ? undefined : (sent as { error?: string }).error,
        }).catch(() => undefined);
      }
      result.notified += 1;
    } catch (err) {
      result.errors += 1;
      console.warn(
        `[stock-alert] variant ${row.id} (tenant ${row.tenant_id}) failed:`,
        err,
      );
    }
  }

  if (result.scanned > 0) {
    console.warn(
      `[stock-alert] done: notified=${result.notified} skipped=${result.skipped} errors=${result.errors}`,
    );
  }
  return result;
}
