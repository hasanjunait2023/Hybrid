// CSV import/export (tenant roadmap P2-5). Pure parser/serializer (no deps) +
// product import (create product + default variant) and product/customer export.
// Import writes via withTenant (RLS); each row is independent so a bad row never
// aborts the batch — partial success is reported.
import { withTenant } from "@hybrid/db";
import { slugify } from "@/lib/admin/format";

// ---- pure CSV core ---------------------------------------------------------
const needsQuote = (s: string) => /[",\r\n]/.test(s);
const quote = (s: string) => (needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function serializeCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) lines.push(row.map((c) => quote(c ?? "")).join(","));
  return lines.join("\r\n");
}

// RFC-4180-ish parser: quoted fields, "" escapes, embedded commas/newlines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* swallow; \n handles the break */ }
    else field += ch;
  }
  // flush trailing field/row (no terminal newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // drop a fully-empty trailing row
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// ---- product export --------------------------------------------------------
export interface ProductExportRow {
  title: string;
  slug: string;
  status: string;
  price: number;
  inventory: number;
}

export function productsToCsv(rows: ProductExportRow[]): string {
  return serializeCsv(
    ["title", "slug", "status", "price", "inventory"],
    rows.map((p) => [p.title, p.slug, p.status, String(p.price), String(p.inventory)]),
  );
}

// ---- customer export -------------------------------------------------------
export interface CustomerExportRow {
  name: string | null;
  phone: string;
  ordersCount: number;
  totalSpent: number;
}

export function customersToCsv(rows: CustomerExportRow[]): string {
  return serializeCsv(
    ["name", "phone", "orders", "total_spent"],
    rows.map((c) => [c.name ?? "", c.phone, String(c.ordersCount), String(c.totalSpent)]),
  );
}

// ---- product import --------------------------------------------------------
export interface ParsedProduct {
  title: string;
  price: number;
  inventory: number;
  status: "draft" | "active" | "archived";
  sku: string | null;
}

export interface ProductParseResult {
  rows: ParsedProduct[];
  errors: { line: number; reason: string }[];
}

const STATUSES = new Set(["draft", "active", "archived"]);

// Header-driven: needs a `title` column; `price`, `inventory`, `status`, `sku`
// optional. Line numbers are 1-based incl. the header row (so a user can map
// errors back to their spreadsheet).
export function parseProductCsv(text: string): ProductParseResult {
  const table = parseCsv(text);
  const errors: { line: number; reason: string }[] = [];
  const rows: ParsedProduct[] = [];
  if (table.length === 0) return { rows, errors: [{ line: 1, reason: "ফাইল খালি" }] };

  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const ti = col("title");
  if (ti < 0) return { rows, errors: [{ line: 1, reason: "title কলাম নেই" }] };
  const pi = col("price");
  const ii = col("inventory");
  const si = col("status");
  const ki = col("sku");

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    const line = r + 1;
    const title = (cells[ti] ?? "").trim();
    if (!title) { errors.push({ line, reason: "title খালি" }); continue; }
    const price = pi >= 0 ? Number((cells[pi] ?? "0").trim() || "0") : 0;
    const inventory = ii >= 0 ? Math.trunc(Number((cells[ii] ?? "0").trim() || "0")) : 0;
    if (!Number.isFinite(price) || price < 0) { errors.push({ line, reason: "price সঠিক নয়" }); continue; }
    if (!Number.isFinite(inventory) || inventory < 0) { errors.push({ line, reason: "inventory সঠিক নয়" }); continue; }
    const rawStatus = si >= 0 ? (cells[si] ?? "").trim().toLowerCase() : "draft";
    const status = (STATUSES.has(rawStatus) ? rawStatus : "draft") as ParsedProduct["status"];
    const sku = ki >= 0 ? (cells[ki] ?? "").trim() || null : null;
    rows.push({ title: title.slice(0, 200), price, inventory, status, sku });
  }
  return { rows, errors };
}

export interface ImportResult {
  created: number;
  failed: { title: string; reason: string }[];
}

// Create a product + a single default variant per parsed row. Slug from the
// title; a slug collision (unique per tenant) drops that row to `failed`.
export async function importProducts(
  tenantId: string,
  userId: string,
  rows: ParsedProduct[],
): Promise<ImportResult> {
  const failed: { title: string; reason: string }[] = [];
  let created = 0;
  for (const p of rows) {
    try {
      await withTenant(tenantId, userId, async (tx) => {
        const slug = slugify(p.title) || `product-${Date.now()}`;
        const prod = await tx<{ id: string }[]>`
          insert into product (tenant_id, title, slug, status)
          values (${tenantId}, ${p.title}, ${slug}, ${p.status}::product_status)
          returning id
        `;
        const productId = prod[0]!.id;
        await tx`
          insert into product_variant (tenant_id, product_id, title, sku, price, inventory_quantity, track_inventory)
          values (${tenantId}, ${productId}, 'Default', ${p.sku}, ${p.price}, ${p.inventory}, true)
        `;
      });
      created += 1;
    } catch (e) {
      const msg = e instanceof Error && /duplicate|unique/i.test(e.message) ? "একই slug আগে থেকে আছে" : "যোগ ব্যর্থ";
      failed.push({ title: p.title, reason: msg });
    }
  }
  return { created, failed };
}
