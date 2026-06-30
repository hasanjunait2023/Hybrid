// =============================================================================
// R3 — Public client-safe re-exports for size charts.
//
// All schemas + types live in `./sizeChartSchema`. This module is the
// single import surface for client components so they don't have to know
// about the schema-vs-server split. Do NOT add server-only helpers (withTenant,
// postgres.js) here — it would break the client bundle.
// =============================================================================

export {
  SIZE_CHART_CATEGORIES,
  SizeChartCategorySchema,
  SizeChartUnitSchema,
  SizeChartDataSchema,
  SizeChartInputSchema,
  parseSizeChart,
} from "./sizeChartSchema";
export type {
  SizeChart,
  SizeChartInput,
  SizeChartData,
  SizeChartRow,
  SizeChartColumn,
  SizeChartCategory,
  SizeChartUnit,
} from "./sizeChartSchema";