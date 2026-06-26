// Shipping rate calculator (M3). Zone-based per-tenant rates computed at
// checkout from the destination address + parcel weight. Pure functions are
// unit-tested; the DB loader resolves config + rates + variant weights via
// withTenant (tenant-safe). Authoritative: checkout computes shipping
// server-side and passes it to placeOrder — never trusts a client value.
import { withTenant } from "@hybrid/db";

export type ShippingZone = "same_district" | "same_division" | "other_division";

export interface ShippingConfig {
  enabled: boolean;
  originDivision: string | null;
  originDistrict: string | null;
  volumetricDivisor: number;
  freeAbove: number | null;
  defaultRate: number;
}

export interface ZoneRate {
  zone: ShippingZone;
  base: number;
  perKg: number;
}

/** Destination zone relative to the tenant's origin (Bangla titles, exact match). */
export function zoneFor(
  origin: { division: string | null; district: string | null },
  dest: { division: string; district: string },
): ShippingZone {
  if (origin.district && dest.district && origin.district === dest.district) {
    return "same_district";
  }
  if (origin.division && dest.division && origin.division === dest.division) {
    return "same_division";
  }
  return "other_division";
}

/** Billable weight in kg — ceil, minimum 1kg. Volumetric is a follow-up (needs dims). */
export function billableKg(weightGrams: number): number {
  return Math.max(1, Math.ceil((weightGrams || 0) / 1000));
}

/**
 * Pure rate computation. Returns the shipping charge in BDT, or null when
 * shipping is not configured (caller falls back to manual/flat entry).
 */
export function computeShipping(args: {
  config: ShippingConfig;
  rates: ZoneRate[];
  zone: ShippingZone;
  weightGrams: number;
  subtotal: number;
}): number | null {
  const { config, rates, zone, weightGrams, subtotal } = args;
  if (!config.enabled) return null;
  if (config.freeAbove != null && subtotal >= config.freeAbove) return 0;
  const kg = billableKg(weightGrams);
  const rate = rates.find((r) => r.zone === zone);
  if (!rate) return Math.round(config.defaultRate);
  return Math.round(rate.base + rate.perKg * kg);
}

export interface ShippingQuoteInput {
  items: { variantId: string; quantity: number }[];
  destDivision: string;
  destDistrict: string;
  subtotal: number;
}

export interface ShippingQuote {
  /** null when shipping is not configured (UI shows manual entry / free). */
  amount: number | null;
  zone: ShippingZone;
  weightGrams: number;
}

/**
 * Resolve a shipping quote for a tenant. Loads config + zone rates + the parcel
 * weight (sum of variant weight_grams * qty) under RLS, then applies the pure
 * calc. Call this from the checkout server action; pass `amount` to placeOrder.
 */
export async function calculateShipping(
  tenantId: string,
  userId: string,
  input: ShippingQuoteInput,
): Promise<ShippingQuote> {
  return withTenant(tenantId, userId, async (tx) => {
    const cfgRows = await tx<
      {
        enabled: boolean;
        origin_division: string | null;
        origin_district: string | null;
        volumetric_divisor: number;
        free_above: string | null;
        default_rate: string;
      }[]
    >`
      select enabled, origin_division, origin_district, volumetric_divisor,
             free_above, default_rate
      from shipping_config where tenant_id = ${tenantId} limit 1
    `;
    const config: ShippingConfig = cfgRows[0]
      ? {
          enabled: cfgRows[0].enabled,
          originDivision: cfgRows[0].origin_division,
          originDistrict: cfgRows[0].origin_district,
          volumetricDivisor: cfgRows[0].volumetric_divisor,
          freeAbove: cfgRows[0].free_above != null ? Number(cfgRows[0].free_above) : null,
          defaultRate: Number(cfgRows[0].default_rate),
        }
      : { enabled: false, originDivision: null, originDistrict: null, volumetricDivisor: 5000, freeAbove: null, defaultRate: 60 };

    const rateRows = await tx<{ zone: string; base: string; per_kg: string }[]>`
      select zone, base, per_kg from shipping_zone_rate where tenant_id = ${tenantId}
    `;
    const rates: ZoneRate[] = rateRows.map((r) => ({
      zone: r.zone as ShippingZone,
      base: Number(r.base),
      perKg: Number(r.per_kg),
    }));

    const ids = input.items.map((i) => i.variantId);
    let weightGrams = 0;
    if (ids.length > 0) {
      const weights = await tx<{ id: string; weight_grams: number | null }[]>`
        select id, weight_grams from product_variant where id = any(${ids})
      `;
      const byId = new Map(weights.map((w) => [w.id, w.weight_grams ?? 0]));
      for (const item of input.items) {
        weightGrams += (byId.get(item.variantId) ?? 0) * item.quantity;
      }
    }

    const zone = zoneFor(
      { division: config.originDivision, district: config.originDistrict },
      { division: input.destDivision, district: input.destDistrict },
    );
    const amount = computeShipping({ config, rates, zone, weightGrams, subtotal: input.subtotal });
    return { amount, zone, weightGrams };
  });
}
