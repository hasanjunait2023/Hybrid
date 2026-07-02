import "server-only";

// Marketplace reconcile passes — the safety net behind the live admin hooks and
// the checkout orchestrator. Extracted from the cron route so each pass is unit-
// testable in isolation. All run via asPlatformAdmin (cross-tenant platform
// tooling); each is best-effort and isolated so one failure never aborts a sweep.
import { asPlatformAdmin } from "@hybrid/db";

// Recompute rating rollups from approved reviews in one pass.
export async function rollupRatings(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_listing ml set
        rating_count = coalesce(sub.cnt, 0),
        rating_avg   = coalesce(sub.avg, 0)
      from (
        select product_id, count(*)::int as cnt, round(avg(rating)::numeric, 2) as avg
          from marketplace_review where status = 'approved'
         group by product_id
      ) sub
      where ml.product_id = sub.product_id
    `;
    // Zero out listings whose last approved review was removed/rejected.
    await tx`
      update marketplace_listing set rating_count = 0, rating_avg = 0
       where rating_count > 0
         and product_id not in (select product_id from marketplace_review where status = 'approved')
    `;
  });
}

// Backfill sub-order + commission rows for marketplace-channel tenant `orders`
// that were committed but never got their buyer-visible bridge rows — e.g. the
// checkout orchestrator crashed in step 3 (the asPlatformAdmin bridge) AFTER the
// per-vendor orders had already committed in step 2. Without this, those orders
// are fulfilled by the vendor (real COD) yet invisible to the buyer and missing
// from the commission ledger, and saga-recovery would wrongly mark the parent
// 'failed'. Keyed on the missing sub-order, so it never double-writes commission.
// Returns the number of sub-orders recreated.
export async function backfillMissingSuborders(): Promise<number> {
  return asPlatformAdmin(async (tx) => {
    const cfg = await tx<{ commission_rate: string }[]>`
      select commission_rate from marketplace_config where id = true limit 1
    `;
    const rate = Number(cfg[0]?.commission_rate ?? 0.05);

    const recreated = await tx<{ id: string }[]>`
      with new_subs as (
        insert into marketplace_suborder
          (marketplace_order_id, buyer_id, tenant_id, vendor_name, order_id, order_number,
           status, payment_status, items_subtotal, shipping_total, grand_total, cod_amount)
        select
          o.marketplace_order_id, mo.buyer_id, o.tenant_id, t.name, o.id, o.order_number,
          o.fulfillment_status::text, o.payment_status::text,
          o.subtotal, o.shipping_total, o.grand_total, o.cod_amount
        from orders o
        join marketplace_order mo on mo.id = o.marketplace_order_id
        join tenant t on t.id = o.tenant_id
        where o.channel = 'marketplace'
          and o.marketplace_order_id is not null
          and not exists (
            select 1 from marketplace_suborder s
             where s.marketplace_order_id = o.marketplace_order_id
               and s.order_id = o.id
          )
        returning id, tenant_id, marketplace_order_id, items_subtotal
      ),
      new_comm as (
        insert into marketplace_commission
          (marketplace_order_id, suborder_id, tenant_id, gross, rate, commission_amount)
        select ns.marketplace_order_id, ns.id, ns.tenant_id, ns.items_subtotal, ${rate},
               round((ns.items_subtotal * ${rate})::numeric, 2)
        from new_subs ns
      )
      select id from new_subs
    `;
    return recreated.length;
  });
}

// Copy each sub-order's live fulfillment/payment status from the tenant `orders`
// row into the buyer-visible marketplace_suborder snapshot, so buyer order
// history never has to read tenant `orders`. Matched by the value-link order_id.
export async function syncSuborderStatus(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_suborder mso
         set status = o.fulfillment_status::text,
             payment_status = o.payment_status::text,
             updated_at = now()
        from orders o
       where o.id = mso.order_id
         and o.tenant_id = mso.tenant_id
         and (mso.status is distinct from o.fulfillment_status::text
              or mso.payment_status is distinct from o.payment_status::text)
    `;
  });
}

// Saga recovery: finalize parents left 'pending' by a mid-checkout crash (the
// orchestrator normally finalizes them itself). Older than 15 min, derive the
// terminal status from how many sub-orders actually committed. Run AFTER
// backfillMissingSuborders so the counts reflect real orders.
export async function recoverStalledOrders(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_order mo
         set status = case
               when (select count(*) from marketplace_suborder s where s.marketplace_order_id = mo.id) = 0 then 'failed'
               when (select count(*) from marketplace_suborder s where s.marketplace_order_id = mo.id) < mo.vendor_count then 'partial'
               else 'confirmed' end,
             updated_at = now()
       where mo.status = 'pending'
         and mo.created_at < now() - interval '15 minutes'
    `;
  });
}
