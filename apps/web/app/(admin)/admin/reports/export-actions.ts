"use server";

// Reports export server actions — generate CSV strings server-side and
// return as a data URI for the client to trigger a download.

import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { recordAudit } from "@/lib/audit/record";
import {
  getSalesReport,
  getTopProducts,
  toCsv,
  type DateRange,
} from "@/lib/admin/reports";

function parseRange(raw: unknown): DateRange {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid range");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.from !== "string" || typeof r.to !== "string") {
    throw new Error("Invalid range fields");
  }
  return { from: r.from, to: r.to };
}

export interface ExportResult {
  ok: boolean;
  /** data URI with CSV content (RFC 2397) */
  dataUri?: string;
  filename?: string;
  error?: string;
}

export async function exportSalesCsv(range: unknown): Promise<ExportResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  let parsed: DateRange;
  try {
    parsed = parseRange(range);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid" };
  }

  const report = await getSalesReport(tenantId, session.userId, parsed);
  const csv = toCsv(
    report.days.map((d) => ({
      date: d.day,
      orders: d.orders,
      revenue: d.revenue,
    })),
    [
      { key: "date", label: "Date" },
      { key: "orders", label: "Orders" },
      { key: "revenue", label: "Revenue (BDT)" },
    ],
  );

  await recordAudit({
    tenantId,
    actorUserId: session.userId,
    action: "settings.update",
    resourceType: "report",
    resourceId: "sales",
    details: { from: parsed.from, to: parsed.to },
  });

  return {
    ok: true,
    dataUri: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
    filename: `sales_${parsed.from}_${parsed.to}.csv`,
  };
}

export async function exportTopProductsCsv(
  range: unknown,
  limit = 100,
): Promise<ExportResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  let parsed: DateRange;
  try {
    parsed = parseRange(range);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid" };
  }

  const products = await getTopProducts(tenantId, session.userId, parsed, limit);
  const csv = toCsv(
    products.map((p) => ({
      name: p.title,
      sold: p.units,
      revenue: p.revenue,
    })),
    [
      { key: "name", label: "Product" },
      { key: "sold", label: "Units sold" },
      { key: "revenue", label: "Revenue (BDT)" },
    ],
  );

  await recordAudit({
    tenantId,
    actorUserId: session.userId,
    action: "settings.update",
    resourceType: "report",
    resourceId: "top_products",
    details: { from: parsed.from, to: parsed.to, limit },
  });

  return {
    ok: true,
    dataUri: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
    filename: `top_products_${parsed.from}_${parsed.to}.csv`,
  };
}