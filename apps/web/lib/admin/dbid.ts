// DBID Compliance Wizard read layer (Tier 3 P1 — regulatory moat).
// All reads go through withTenant so RLS enforces tenant isolation. The
// returned shape is SAFE FOR DISPLAY — sealed envelopes (NID/TIN/etc.) are
// reduced to last-4 hints + masked tail, never the full document number.
//
// The wizard is a 4-step flow:
//   Step 1: Business identity (name, type, owner name/DOB)
//   Step 2: NID (national ID) of the owner
//   Step 3: TIN + Trade License
//   Step 4: Review + submit to DBID
//
// "Step" advances on each successful partial save. The wizard can be saved
// partway and resumed — that's the whole point vs a one-shot form.
import { withTenant } from "@hybrid/db";

export type DbidStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";

export type BusinessType = "proprietorship" | "partnership" | "ltd";

export interface DbidSubmission {
  id: string;
  tenantId: string;

  // Last-4 hints only. The sealed envelopes stay server-side.
  nidLast4: string | null;
  tinLast4: string | null;
  tradeLicenseLast4: string | null;
  binLast4: string | null;

  businessName: string | null;
  businessType: BusinessType | null;
  ownerFullName: string | null;
  ownerDob: string | null; // YYYY-MM-DD

  status: DbidStatus;
  step: 1 | 2 | 3 | 4;

  reviewerNotes: string | null;
  dbidNumber: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
}

interface RawRow {
  id: string;
  tenant_id: string;
  nid_sealed: unknown;
  tin_sealed: unknown;
  trade_license_sealed: unknown;
  bin_sealed: unknown;
  business_name: string | null;
  business_type: string | null;
  owner_full_name: string | null;
  owner_dob: string | null;
  status: DbidStatus;
  step: number;
  reviewer_notes: string | null;
  dbid_number: string | null;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  expires_at: Date | null;
}

// Pull last-4 from a sealed envelope without ever exposing the full doc.
// Returns null for empty / malformed envelopes.
function last4(envelope: unknown): string | null {
  if (!envelope || typeof envelope !== "object") return null;
  const e = envelope as Record<string, unknown>;
  const last4 = typeof e.last4 === "string" ? e.last4 : null;
  if (last4) return last4;
  // Fallback: if the doc number is present (shouldn't be — sealed) or a
  // legacy row predates last4, take the last 4 of the number field.
  const n = typeof e.number === "string" ? e.number : null;
  if (n && n.length >= 4) return `••••${n.slice(-4)}`;
  return null;
}

function rowToSubmission(r: RawRow): DbidSubmission {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    nidLast4: last4(r.nid_sealed),
    tinLast4: last4(r.tin_sealed),
    tradeLicenseLast4: last4(r.trade_license_sealed),
    binLast4: last4(r.bin_sealed),
    businessName: r.business_name,
    businessType:
      r.business_type === "proprietorship" ||
      r.business_type === "partnership" ||
      r.business_type === "ltd"
        ? r.business_type
        : null,
    ownerFullName: r.owner_full_name,
    ownerDob: r.owner_dob,
    status: r.status,
    step: (Math.min(4, Math.max(1, r.step)) as 1 | 2 | 3 | 4),
    reviewerNotes: r.reviewer_notes,
    dbidNumber: r.dbid_number,
    submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
  };
}

export async function getDbidSubmission(
  tenantId: string,
  userId: string,
): Promise<DbidSubmission | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<RawRow[]>`select
      id, tenant_id, nid_sealed, tin_sealed, trade_license_sealed, bin_sealed,
      business_name, business_type, owner_full_name, owner_dob,
      status, step, reviewer_notes, dbid_number,
      submitted_at, reviewed_at, expires_at
    from dbid_submission
    where tenant_id = ${tenantId}
    limit 1`,
  );
  const row = rows[0];
  return row ? rowToSubmission(row) : null;
}

// Quick status helper for the settings index badge.
export interface DbidSummary {
  status: DbidStatus;
  dbidNumber: string | null;
  expiresAt: string | null;
}

export async function getDbidSummary(
  tenantId: string,
  userId: string,
): Promise<DbidSummary> {
  const sub = await getDbidSubmission(tenantId, userId);
  if (!sub) {
    return { status: "not_started", dbidNumber: null, expiresAt: null };
  }
  return {
    status: sub.status,
    dbidNumber: sub.dbidNumber,
    expiresAt: sub.expiresAt,
  };
}