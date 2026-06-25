// ============================================================================
// CSV import/export slice (tenant roadmap P2-5). Pure parser/serializer round
// trips + product import against embedded Postgres (RLS).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import {
  serializeCsv,
  parseCsv,
  parseProductCsv,
  importProducts,
} from "../../../apps/web/lib/admin/csv";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

async function cleanup(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      delete from product_variant where product_id in (
        select id from product where tenant_id = ${TENANT_A} and slug like 'csv-%'
      )
    `;
    await tx`delete from product where tenant_id = ${TENANT_A} and slug like 'csv-%'`;
  });
}

describe("csv import/export slice (P2-5)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("1. serialize quotes fields with commas/quotes/newlines", () => {
    const csv = serializeCsv(["a", "b"], [["x,y", 'he said "hi"']]);
    expect(csv).toBe('a,b\r\n"x,y","he said ""hi"""');
  });

  it("1b. neutralizes CSV formula injection (=,+,-,@)", () => {
    const csv = serializeCsv(["a"], [["=cmd|' /c calc'!A1"], ["+1"], ["@SUM(A1)"], ["safe"]]);
    const lines = csv.split("\r\n");
    expect(lines[1]!.startsWith("\"'=") || lines[1]!.startsWith("'=")).toBe(true);
    expect(lines[2]).toBe("'+1");
    expect(lines[3]).toBe("'@SUM(A1)");
    expect(lines[4]).toBe("safe");
  });

  it("2. parse round-trips quoted fields", () => {
    const table = parseCsv('a,b\r\n"x,y","he said ""hi"""');
    expect(table).toEqual([
      ["a", "b"],
      ["x,y", 'he said "hi"'],
    ]);
  });

  it("3. parseProductCsv validates rows + flags errors", () => {
    const { rows, errors } = parseProductCsv(
      "title,price,inventory,status\nCSV Shirt,500,10,active\n,9,9,active\nCSV Cap,-5,3,active",
    );
    expect(rows).toHaveLength(1); // only the valid first row
    expect(rows[0]!.title).toBe("CSV Shirt");
    expect(rows[0]!.price).toBe(500);
    expect(rows[0]!.status).toBe("active");
    // line 3 empty title, line 4 negative price
    expect(errors.map((e) => e.line).sort()).toEqual([3, 4]);
  });

  it("4. importProducts creates products + a default variant", async () => {
    // Use csv- slugs so cleanup catches them; titles slugify to csv-...
    const { rows } = parseProductCsv("title,price,inventory\ncsv alpha,100,5\ncsv beta,200,3");
    const res = await importProducts(TENANT_A, OWNER_A, rows);
    expect(res.created).toBe(2);
    expect(res.failed).toHaveLength(0);

    const count = await withTenant(TENANT_A, OWNER_A, async (tx) => {
      const r = await tx<{ n: number }[]>`
        select count(*)::int as n from product where tenant_id = ${TENANT_A} and slug like 'csv-%'
      `;
      return r[0]!.n;
    });
    expect(count).toBe(2);

    // Re-import the same titles → slug collision → all fail (partial success).
    const again = await importProducts(TENANT_A, OWNER_A, rows);
    expect(again.created).toBe(0);
    expect(again.failed).toHaveLength(2);
  });
});
