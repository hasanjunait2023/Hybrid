// =============================================================================
// R3 — Server-only size chart helpers.
//
// DB queries only. Pure Zod schemas + types live in `./sizeChartSchema`
// (importable from client components). Client components must NOT import
// from this file — postgres.js is server-only.
// =============================================================================

import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import {
  parseSizeChart,
  type SizeChart,
  type SizeChartInput,
  type SizeChartData,
  type SizeChartUnit,
} from "./sizeChartSchema";

// Re-export the schemas and types so server callers have a single import.
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
  SizeChartUnit,
} from "./sizeChartSchema";

// ---- DB queries (withTenant ONLY) ------------------------------------------

type RawSizeChartRow = {
  id: string;
  tenant_id: string;
  category: string;
  unit: string;
  chart_data: SizeChartData | null;
  updated_at: Date | string | null;
};

type Jsonb = Parameters<Tx["json"]>[0];

function normalize(raw: RawSizeChartRow): SizeChart {
  const data: SizeChartData =
    raw.chart_data && Array.isArray(raw.chart_data.rows)
      ? raw.chart_data
      : { columns: ["size"], rows: [{ size: "Free Size" }] };
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    category: raw.category,
    unit: (raw.unit === "cm" ? "cm" : "inch") as SizeChartUnit,
    chartData: data,
    updatedAt:
      raw.updated_at instanceof Date
        ? raw.updated_at.toISOString()
        : typeof raw.updated_at === "string"
          ? raw.updated_at
          : null,
  };
}

/**
 * Public storefront read. Returns null if the merchant has not published a
 * chart for this category yet (the PDP hides the "Size Guide" button in
 * that case).
 */
export async function getSizeChartForCategory(
  tenantId: string,
  category: string | null | undefined,
): Promise<SizeChart | null> {
  if (!category) return null;
  return withTenant(tenantId, null, async (tx) => {
    const rows = await tx<RawSizeChartRow[]>`
      select id, tenant_id, category, unit, chart_data, updated_at
        from size_chart
       where category = ${category}
       limit 1
    `;
    return rows[0] ? normalize(rows[0]) : null;
  });
}

/** Admin read — same shape as storefront but explicitly typed for the editor. */
export async function getSizeChartByCategory(
  tenantId: string,
  userId: string,
  category: string,
): Promise<SizeChart | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<RawSizeChartRow[]>`
      select id, tenant_id, category, unit, chart_data, updated_at
        from size_chart
       where category = ${category}
       limit 1
    `;
    return rows[0] ? normalize(rows[0]) : null;
  });
}

/** List every chart the tenant has — the admin settings page lists all of
 *  them so the merchant can pick which to edit. */
export async function listSizeCharts(
  tenantId: string,
  userId: string,
): Promise<SizeChart[]> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<RawSizeChartRow[]>`
      select id, tenant_id, category, unit, chart_data, updated_at
        from size_chart
       order by category asc
    `;
    return rows.map(normalize);
  });
}

/**
 * Upsert a size chart. ON CONFLICT (tenant_id, category) DO UPDATE means
 * the merchant can re-save the same category and the row updates rather
 * than throwing. Throws on a Zod failure (let the caller format the error).
 */
export async function upsertSizeChart(
  tenantId: string,
  userId: string,
  input: SizeChartInput,
): Promise<SizeChart> {
  const parsed = parseSizeChart(input);
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<RawSizeChartRow[]>`
      insert into size_chart (tenant_id, category, unit, chart_data)
      values (
        ${tenantId},
        ${parsed.category},
        ${parsed.unit},
        ${tx.json(parsed.chartData as unknown as Jsonb)}
      )
      on conflict (tenant_id, category) do update
        set unit       = excluded.unit,
            chart_data = excluded.chart_data,
            updated_at = now()
      returning id, tenant_id, category, unit, chart_data, updated_at
    `;
    if (!rows[0]) throw new Error("UPSERT_SIZE_CHART_FAILED");
    return normalize(rows[0]);
  });
}