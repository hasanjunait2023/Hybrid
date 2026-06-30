// =============================================================================
// R3 — Client-safe size chart schemas.
//
// Pure Zod schemas + types — importable from client components. Server-only
// helpers (withTenant, postgres.js) live in `lib/products/sizeChart.ts`.
// =============================================================================

import { z } from "zod";

export const SIZE_CHART_CATEGORIES = [
  "clothing_top",
  "clothing_bottom",
  "clothing_dress",
  "footwear",
  "accessories",
] as const;
export type SizeChartCategory = (typeof SIZE_CHART_CATEGORIES)[number];

export type SizeChartUnit = "inch" | "cm";

export const SizeChartCategorySchema = z.enum(SIZE_CHART_CATEGORIES);
export const SizeChartUnitSchema = z.enum(["inch", "cm"]);

const ChartRowSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.null()]))
  .refine((row) => typeof row.size === "string" && row.size.trim().length > 0, {
    message: "row is missing the required 'size' key",
  });

export const SizeChartDataSchema = z
  .object({
    columns: z
      .array(z.string().trim().min(1).max(40))
      .min(1, "columns list cannot be empty")
      .max(20),
    rows: z
      .array(ChartRowSchema)
      .min(1, "at least one size row is required")
      .max(50),
  })
  .superRefine((val, ctx) => {
    if (!val.columns.includes("size")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["columns"],
        message: "'size' must be one of the columns",
      });
    }
  });

export type SizeChartRow = z.infer<typeof ChartRowSchema>;
export type SizeChartColumn = string;
export type SizeChartData = z.infer<typeof SizeChartDataSchema>;

export const SizeChartInputSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1, "category is required")
    .max(60)
    .regex(/^[a-z0-9_-]+$/i, "category must be alphanumeric (a-z, 0-9, _, -)"),
  unit: SizeChartUnitSchema,
  chartData: SizeChartDataSchema,
});
export type SizeChartInput = z.infer<typeof SizeChartInputSchema>;

export function parseSizeChart(input: unknown): SizeChartInput {
  return SizeChartInputSchema.parse(input);
}

// Public row type for client/server consumption
export interface SizeChart {
  id: string;
  tenantId: string;
  category: string;
  unit: SizeChartUnit;
  chartData: SizeChartData;
  updatedAt: string | null;
}