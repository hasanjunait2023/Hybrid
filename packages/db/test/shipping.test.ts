// Shipping rate calculator (M3). Pure-function coverage (no DB) + one DB
// integration through withTenant against the embedded-pg harness.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin } from "../src/index";
import {
  zoneFor,
  billableKg,
  computeShipping,
  calculateShipping,
  type ShippingConfig,
  type ZoneRate,
} from "../../../apps/web/lib/commerce/shipping";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const CFG: ShippingConfig = {
  enabled: true,
  originDivision: "ঢাকা",
  originDistrict: "ঢাকা",
  volumetricDivisor: 5000,
  freeAbove: 2000,
  defaultRate: 100,
};
const RATES: ZoneRate[] = [
  { zone: "same_district", base: 60, perKg: 0 },
  { zone: "same_division", base: 80, perKg: 10 },
  { zone: "other_division", base: 120, perKg: 20 },
];

describe("shipping calculator — pure", () => {
  it("zoneFor classifies district/division/other", () => {
    expect(zoneFor({ division: "ঢাকা", district: "ঢাকা" }, { division: "ঢাকা", district: "ঢাকা" })).toBe("same_district");
    expect(zoneFor({ division: "ঢাকা", district: "ঢাকা" }, { division: "ঢাকা", district: "গাজীপুর" })).toBe("same_division");
    expect(zoneFor({ division: "ঢাকা", district: "ঢাকা" }, { division: "চট্টগ্রাম", district: "চট্টগ্রাম" })).toBe("other_division");
  });

  it("billableKg ceils with a 1kg floor", () => {
    expect(billableKg(0)).toBe(1);
    expect(billableKg(500)).toBe(1);
    expect(billableKg(1000)).toBe(1);
    expect(billableKg(1001)).toBe(2);
    expect(billableKg(3200)).toBe(4);
  });

  it("computeShipping applies base + per_kg by zone", () => {
    expect(computeShipping({ config: CFG, rates: RATES, zone: "same_district", weightGrams: 500, subtotal: 500 })).toBe(60);
    // same_division, 2.2kg -> ceil 3kg: 80 + 10*3 = 110
    expect(computeShipping({ config: CFG, rates: RATES, zone: "same_division", weightGrams: 2200, subtotal: 500 })).toBe(110);
    // other_division, 1kg: 120 + 20*1 = 140
    expect(computeShipping({ config: CFG, rates: RATES, zone: "other_division", weightGrams: 800, subtotal: 500 })).toBe(140);
  });

  it("free shipping above threshold, and null when disabled", () => {
    expect(computeShipping({ config: CFG, rates: RATES, zone: "other_division", weightGrams: 5000, subtotal: 2000 })).toBe(0);
    expect(computeShipping({ config: { ...CFG, enabled: false }, rates: RATES, zone: "same_district", weightGrams: 500, subtotal: 100 })).toBeNull();
  });

  it("falls back to default_rate when no zone row matches", () => {
    expect(computeShipping({ config: CFG, rates: [], zone: "same_district", weightGrams: 500, subtotal: 100 })).toBe(100);
  });
});

describe("shipping calculator — DB (withTenant)", () => {
  const VARIANT = "c1000021-0000-0000-0000-0000000c1021";
  const PRODUCT = "c1000021-0000-0000-0000-0000000c2021";

  async function cleanup(): Promise<void> {
    await asPlatformAdmin(async (tx) => {
      await tx`delete from shipping_zone_rate where tenant_id = ${TENANT_A}`;
      await tx`delete from shipping_config where tenant_id = ${TENANT_A}`;
      await tx`delete from product_variant where id = ${VARIANT}`;
      await tx`delete from product where id = ${PRODUCT}`;
    });
  }
  beforeAll(cleanup);
  afterAll(cleanup);

  it("calculateShipping loads config + weights and quotes", async () => {
    await asPlatformAdmin(async (tx) => {
      await tx`insert into product (id, tenant_id, title, slug, status)
               values (${PRODUCT}, ${TENANT_A}, 'Ship Test', 'ship-test-21', 'active')`;
      await tx`insert into product_variant (id, tenant_id, product_id, price, weight_grams)
               values (${VARIANT}, ${TENANT_A}, ${PRODUCT}, 500, 1200)`;
      await tx`insert into shipping_config (tenant_id, origin_division, origin_district, free_above, default_rate, enabled)
               values (${TENANT_A}, 'ঢাকা', 'ঢাকা', 2000, 100, true)`;
      await tx`insert into shipping_zone_rate (tenant_id, zone, base, per_kg) values
               (${TENANT_A}, 'same_division', 80, 10),
               (${TENANT_A}, 'other_division', 120, 20)`;
    });

    // 2 units * 1200g = 2400g -> ceil 3kg. dest Chattogram -> other_division: 120 + 20*3 = 180
    const q = await calculateShipping(TENANT_A, OWNER_A, {
      items: [{ variantId: VARIANT, quantity: 2 }],
      destDivision: "চট্টগ্রাম",
      destDistrict: "চট্টগ্রাম",
      subtotal: 1000,
    });
    expect(q.zone).toBe("other_division");
    expect(q.weightGrams).toBe(2400);
    expect(q.amount).toBe(180);
  });
});
