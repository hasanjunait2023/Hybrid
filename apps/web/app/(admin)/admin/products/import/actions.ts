"use server";

// Product CSV import (P2-5). Parse → validate → create products (partial
// success). Auth + RLS via the csv/import data layer; revalidate the catalog.
import { revalidateTag } from "next/cache";
import { parseProductCsv, importProducts } from "@/lib/admin/csv";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface ImportActionResult {
  ok: boolean;
  error?: string;
  created?: number;
  failed?: { title: string; reason: string }[];
  parseErrors?: { line: number; reason: string }[];
}

const MAX_ROWS = 2000;

export async function importProductsAction(csvText: string): Promise<ImportActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  if (typeof csvText !== "string" || csvText.trim().length === 0) {
    return { ok: false, error: "CSV খালি।" };
  }
  const { rows, errors } = parseProductCsv(csvText);
  if (rows.length === 0) {
    return { ok: false, error: "কোনো বৈধ সারি নেই।", parseErrors: errors };
  }
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `সর্বোচ্চ ${MAX_ROWS} সারি একসাথে।` };
  }

  const result = await importProducts(tenantId, session.userId, rows);
  revalidateTag(`tenant:${tenantId}:products`);
  revalidateTag(`tenant:${tenantId}:dashboard`);
  return { ok: true, created: result.created, failed: result.failed, parseErrors: errors };
}
