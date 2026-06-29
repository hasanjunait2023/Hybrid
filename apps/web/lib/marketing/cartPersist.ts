"use server";
// Storefront cart persistence. Saves the current checkout-form cart to the
// `cart` table when the buyer's phone is known (phone is the identity anchor).
// A saved cart becomes an abandoned-cart candidate after 1 h (the sweep reads
// `abandoned_at` set here). On order success, `markCartRecovered` clears it
// so the reminder sweep skips it.
//
// RLS: uses withTenant(tenantId, null) — cart_tenant_all permits all ops when
// tenant_id = app.current_tenant_id(), no user session required (storefront).
import { withTenant } from "@hybrid/db";

export interface CartItem {
  productSlug: string;
  variantId: string;
  title: string;
  qty: number;
  unitPrice: number;
}

export async function persistCart(
  tenantId: string,
  phone: string,
  items: CartItem[],
  total: number,
): Promise<void> {
  if (!phone || items.length === 0) return;
  await withTenant(tenantId, null, async (tx) => {
    // Upsert on (tenant_id, phone). First save sets abandoned_at = now() so
    // the sweep can detect it as abandoned after 1 h. Subsequent updates
    // refresh items/total but leave abandoned_at unchanged (don't reset window).
    // Upsert via the partial unique index on (tenant_id, phone) where phone IS
    // NOT NULL. ON CONFLICT DO NOTHING when recovered_at IS NOT NULL (order
    // already placed from this phone) avoids the update via the WHERE guard.
    await tx`
      insert into cart (tenant_id, phone, items, total, abandoned_at)
      values (
        ${tenantId},
        ${phone},
        ${JSON.stringify(items)}::jsonb,
        ${total},
        now()
      )
      on conflict (tenant_id, phone)
        where phone is not null
      do update set
        items = excluded.items,
        total = excluded.total,
        updated_at = now()
      where cart.recovered_at is null
    `;
  });
}

export async function markCartRecovered(
  tenantId: string,
  phone: string,
): Promise<void> {
  if (!phone) return;
  await withTenant(tenantId, null, async (tx) => {
    await tx`
      update cart
      set recovered_at = now()
      where tenant_id = ${tenantId}
        and phone = ${phone}
        and recovered_at is null
    `;
  });
}
