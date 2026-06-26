// Admin data layer for shipping config (M3). Read/write the per-tenant shipping
// origin + zone rates via withTenant (RLS-safe). The storefront calculator
// (lib/commerce/shipping.ts) consumes the same rows at checkout.
import { withTenant } from "@hybrid/db";
import type { ShippingZone } from "@/lib/commerce/shipping";

export interface ShippingSettings {
  enabled: boolean;
  originDivision: string | null;
  originDistrict: string | null;
  freeAbove: number | null;
  defaultRate: number;
  rates: { zone: ShippingZone; base: number; perKg: number }[];
}

const ZONES: ShippingZone[] = ["same_district", "same_division", "other_division"];

export async function getShippingSettings(tenantId: string, userId: string): Promise<ShippingSettings> {
  return withTenant(tenantId, userId, async (tx) => {
    const cfg = await tx<
      { enabled: boolean; origin_division: string | null; origin_district: string | null; free_above: string | null; default_rate: string }[]
    >`select enabled, origin_division, origin_district, free_above, default_rate
        from shipping_config where tenant_id = ${tenantId} limit 1`;
    const rateRows = await tx<{ zone: string; base: string; per_kg: string }[]>`
      select zone, base, per_kg from shipping_zone_rate where tenant_id = ${tenantId}`;
    const byZone = new Map(rateRows.map((r) => [r.zone, { base: Number(r.base), perKg: Number(r.per_kg) }]));
    return {
      enabled: cfg[0]?.enabled ?? false,
      originDivision: cfg[0]?.origin_division ?? null,
      originDistrict: cfg[0]?.origin_district ?? null,
      freeAbove: cfg[0]?.free_above != null ? Number(cfg[0].free_above) : null,
      defaultRate: cfg[0] ? Number(cfg[0].default_rate) : 60,
      rates: ZONES.map((zone) => ({ zone, base: byZone.get(zone)?.base ?? 0, perKg: byZone.get(zone)?.perKg ?? 0 })),
    };
  });
}

export interface SaveShippingInput {
  enabled: boolean;
  originDivision: string | null;
  originDistrict: string | null;
  freeAbove: number | null;
  defaultRate: number;
  rates: { zone: ShippingZone; base: number; perKg: number }[];
}

export async function saveShippingSettings(tenantId: string, userId: string, input: SaveShippingInput): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      insert into shipping_config (tenant_id, origin_division, origin_district, free_above, default_rate, enabled, updated_at)
      values (${tenantId}, ${input.originDivision}, ${input.originDistrict}, ${input.freeAbove}, ${input.defaultRate}, ${input.enabled}, now())
      on conflict (tenant_id) do update set
        origin_division = excluded.origin_division,
        origin_district = excluded.origin_district,
        free_above = excluded.free_above,
        default_rate = excluded.default_rate,
        enabled = excluded.enabled,
        updated_at = now()
    `;
    for (const r of input.rates) {
      if (!ZONES.includes(r.zone)) continue;
      await tx`
        insert into shipping_zone_rate (tenant_id, zone, base, per_kg, updated_at)
        values (${tenantId}, ${r.zone}, ${Math.max(0, r.base)}, ${Math.max(0, r.perKg)}, now())
        on conflict (tenant_id, zone) do update set
          base = excluded.base, per_kg = excluded.per_kg, updated_at = now()
      `;
    }
  });
}
