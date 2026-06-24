"use server";

// COD settlements Server Actions (blueprint S-COD-RECON; DESIGN §Q3).
//
// Two mutations: ingest a remittance CSV (parse -> match -> compute -> store via
// the recon engine), and mark a discrepancy resolved (manual override). Both are
// tenant-gated through the session + getActiveTenantId, then run entirely via
// withTenant inside the recon/data layer (the golden rule). Money state is only
// ever written from the REAL parsed CSV — never fabricated.
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { SteadfastCsvParser } from "@/lib/cod/parsers/steadfast";
import { reconcileRemittance, TooManyRowsError, MAX_REMITTANCE_ROWS } from "@/lib/cod/recon";
import { markDiscrepancyResolved } from "@/lib/admin/cod";

export interface UploadResult {
  ok: boolean;
  error?: string;
  matchedCount?: number;
  unmatchedCount?: number;
  discrepancyCount?: number;
  parseErrors?: string[];
}

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2MB upload cap (well above 500 rows)

export async function uploadRemittance(
  _prev: UploadResult | null,
  formData: FormData,
): Promise<UploadResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "CSV ফাইল নির্বাচন করুন।" };
  }
  if (file.size > MAX_CSV_BYTES) {
    return { ok: false, error: "ফাইল খুব বড় (সর্বোচ্চ ২MB)।" };
  }

  const reference = (formData.get("reference") as string | null)?.trim() || null;
  const csv = await file.text();

  // Phase-2 ships the Steadfast parser; column names are UNCONFIRMED (flagged in
  // the parser) — the operator can re-bind columns in the preview before commit.
  const parser = new SteadfastCsvParser();
  const parsed = parser.parse(csv);

  // Fail-closed: a hard parse failure (e.g. missing required column) blocks the
  // ingest. Row-level malformed lines are reported but valid lines still process.
  const hardFailure = parsed.lines.length === 0 && parsed.errors.length > 0;
  if (hardFailure) {
    return { ok: false, error: parsed.errors[0]!.message, parseErrors: parsed.errors.map((e) => e.message) };
  }
  if (parsed.lines.length === 0) {
    return { ok: false, error: "কোনো বৈধ লাইন পাওয়া যায়নি।" };
  }

  try {
    const result = await reconcileRemittance(tenantId, session.userId, {
      provider: "steadfast",
      reference,
      remittedAt: new Date(),
      lines: parsed.lines,
      rawCsv: csv,
    });

    revalidateTag(`tenant:${tenantId}:cod`);
    revalidateTag(`tenant:${tenantId}:orders`);
    revalidateTag(`tenant:${tenantId}:dashboard`);

    return {
      ok: true,
      matchedCount: result.matchedCount,
      unmatchedCount: result.unmatchedCount,
      discrepancyCount: result.discrepancyCount,
      parseErrors: parsed.errors.map((e) => e.message),
    };
  } catch (error) {
    if (error instanceof TooManyRowsError) {
      return { ok: false, error: `সর্বোচ্চ ${MAX_REMITTANCE_ROWS} লাইন একসাথে আপলোড করা যায়।` };
    }
    console.error("[uploadRemittance] failed", error);
    return { ok: false, error: "রেমিট্যান্স প্রক্রিয়া ব্যর্থ হয়েছে।" };
  }
}

export interface ResolveResult {
  ok: boolean;
  error?: string;
}

export async function resolveDiscrepancy(
  _prev: ResolveResult | null,
  formData: FormData,
): Promise<ResolveResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };

  const shipmentId = (formData.get("shipmentId") as string | null)?.trim();
  if (!shipmentId) return { ok: false, error: "অবৈধ অনুরোধ।" };

  const done = await markDiscrepancyResolved(tenantId, session.userId, shipmentId);
  if (!done) return { ok: false, error: "সমাধান করা যায়নি (সম্ভবত আগেই সমাধান হয়েছে)।" };

  revalidateTag(`tenant:${tenantId}:cod`);
  return { ok: true };
}
