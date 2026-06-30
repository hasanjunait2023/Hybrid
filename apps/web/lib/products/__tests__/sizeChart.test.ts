// =============================================================================
// R3 — Per-category size charts: pure validation tests.
//
// The DB-touching helpers (getSizeChartForCategory, upsertSizeChart) need a
// live tenant context, covered by the integration suite in packages/db.
// Here we lock down the cheap validation surface so a future schema drift
// on categories / units / chart-data shape surfaces as a TypeScript
// compile error or a fast unit-test fail, not a prod runtime crash.
//
// What's covered:
//   * SizeChartCategorySchema — five documented enum members
//   * SizeChartUnitSchema — 'inch' | 'cm'
//   * SizeChartInputSchema — accepts the canonical shape, rejects malformed
//     categories (uppercase/whitespace), rejects charts without a 'size'
//     column, rejects rows missing the 'size' key, rejects charts with
//     zero rows or too many rows.
//   * parseSizeChart — round-trips a valid input and throws ZodError on a
//     bad one.
//   * SIZE_CHART_CATEGORIES — the const tuple has exactly five entries in
//     the right order so the admin picker renders them in this order.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  SIZE_CHART_CATEGORIES,
  SizeChartCategorySchema,
  SizeChartUnitSchema,
  SizeChartDataSchema,
  SizeChartInputSchema,
  parseSizeChart,
} from "../sizeChart";

describe("SIZE_CHART_CATEGORIES — taxonomy export", () => {
  it("has the documented five categories in the right order", () => {
    expect(SIZE_CHART_CATEGORIES).toEqual([
      "clothing_top",
      "clothing_bottom",
      "clothing_dress",
      "footwear",
      "accessories",
    ]);
  });
});

describe("SizeChartCategorySchema", () => {
  it("accepts every documented category", () => {
    for (const cat of SIZE_CHART_CATEGORIES) {
      expect(SizeChartCategorySchema.safeParse(cat).success).toBe(true);
    }
  });

  it("rejects unknown categories", () => {
    expect(SizeChartCategorySchema.safeParse("toys").success).toBe(false);
    expect(SizeChartCategorySchema.safeParse("").success).toBe(false);
    expect(SizeChartCategorySchema.safeParse(null).success).toBe(false);
  });
});

describe("SizeChartUnitSchema", () => {
  it("accepts inch and cm", () => {
    expect(SizeChartUnitSchema.safeParse("inch").success).toBe(true);
    expect(SizeChartUnitSchema.safeParse("cm").success).toBe(true);
  });

  it("rejects everything else", () => {
    expect(SizeChartUnitSchema.safeParse("mm").success).toBe(false);
    expect(SizeChartUnitSchema.safeParse("INCH").success).toBe(false);
    expect(SizeChartUnitSchema.safeParse("").success).toBe(false);
  });
});

describe("SizeChartDataSchema — chart_data validation", () => {
  it("accepts a canonical clothing_top chart", () => {
    const ok = SizeChartDataSchema.safeParse({
      columns: ["size", "chest", "length"],
      rows: [
        { size: "S", chest: 36, length: 26 },
        { size: "M", chest: 38, length: 27 },
        { size: "L", chest: 40, length: 28 },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("accepts a footwear chart (just size + insole)", () => {
    const ok = SizeChartDataSchema.safeParse({
      columns: ["size", "insole"],
      rows: [
        { size: "39", insole: 25 },
        { size: "40", insole: 26 },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("accepts string-typed measurements (admin editor types them as text)", () => {
    const ok = SizeChartDataSchema.safeParse({
      columns: ["size", "chest"],
      rows: [
        { size: "Free Size", chest: "40-44" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects charts without a 'size' column", () => {
    const bad = SizeChartDataSchema.safeParse({
      columns: ["chest", "length"],
      rows: [{ size: "M", chest: 38 }],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects rows missing the 'size' key", () => {
    const bad = SizeChartDataSchema.safeParse({
      columns: ["size", "chest"],
      rows: [{ chest: 38 }],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects charts with zero rows", () => {
    const bad = SizeChartDataSchema.safeParse({
      columns: ["size"],
      rows: [],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects charts with more than 50 rows (DoS guard for the modal)", () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ size: String(i) }));
    const bad = SizeChartDataSchema.safeParse({
      columns: ["size"],
      rows,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects empty columns array", () => {
    const bad = SizeChartDataSchema.safeParse({
      columns: [],
      rows: [{ size: "M" }],
    });
    expect(bad.success).toBe(false);
  });
});

describe("SizeChartInputSchema — full upsert validation", () => {
  it("accepts the canonical input shape", () => {
    const ok = SizeChartInputSchema.safeParse({
      category: "clothing_top",
      unit: "inch",
      chartData: {
        columns: ["size", "chest", "length"],
        rows: [
          { size: "M", chest: 38, length: 27 },
        ],
      },
    });
    expect(ok.success).toBe(true);
  });

  it("trims surrounding whitespace from category", () => {
    const ok = SizeChartInputSchema.safeParse({
      category: "  clothing_top  ",
      unit: "cm",
      chartData: {
        columns: ["size"],
        rows: [{ size: "M" }],
      },
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.category).toBe("clothing_top");
    }
  });

  it("rejects categories with disallowed characters (space, slash, unicode)", () => {
    for (const cat of ["men shirts", "men/shirts", "পুরুষ শার্ট"]) {
      const bad = SizeChartInputSchema.safeParse({
        category: cat,
        unit: "inch",
        chartData: { columns: ["size"], rows: [{ size: "M" }] },
      });
      expect(bad.success).toBe(false);
    }
  });

  it("rejects empty category", () => {
    const bad = SizeChartInputSchema.safeParse({
      category: "",
      unit: "inch",
      chartData: { columns: ["size"], rows: [{ size: "M" }] },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects unsupported units", () => {
    const bad = SizeChartInputSchema.safeParse({
      category: "clothing_top",
      unit: "feet",
      chartData: { columns: ["size"], rows: [{ size: "M" }] },
    });
    expect(bad.success).toBe(false);
  });
});

describe("parseSizeChart — convenience wrapper", () => {
  it("returns the parsed input on success", () => {
    const result = parseSizeChart({
      category: "footwear",
      unit: "cm",
      chartData: {
        columns: ["size", "insole"],
        rows: [{ size: "42", insole: 27 }],
      },
    });
    expect(result.category).toBe("footwear");
    expect(result.unit).toBe("cm");
    expect(result.chartData.rows).toHaveLength(1);
  });

  it("throws ZodError on bad input", () => {
    expect(() =>
      parseSizeChart({
        category: "",
        unit: "inch",
        chartData: { columns: ["size"], rows: [] },
      }),
    ).toThrow();
  });
});
