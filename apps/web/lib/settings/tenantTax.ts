// =============================================================================
// O13 — Tenant TIN / BIN (Bangladesh NBR tax compliance)
//
// Server-only helpers for reading/writing the `tenant.tin` and `tenant.bin`
// columns added in 32_o13_tin_bin.sql. Pure validation primitives + the Zod
// schema live in `./tenantTaxSchema` so client components (TaxForm) can
// import them without dragging in @hybrid/db (postgres.js is server-only).
//
// Two NBR identifiers every Bangladesh business invoice must carry:
//   * TIN — Taxpayer Identification Number. 12 digits, every taxpayer.
//   * BIN — Business Identification Number.  10 digits, registered businesses.
//
// Everything here goes through `withTenant()` — never the raw `sql` client.
// The DB CHECK constraints are the safety net; the Zod schema mirrors them
// and gives the UI a friendly Bengali error before a round-trip.
// =============================================================================

import { withTenant } from "@hybrid/db";
// Re-export the client-safe validation surface for convenience so server-side
// callers (Server Actions, scripts) only need one import path.
export {
  TIN_REGEX,
  BIN_REGEX,
  TenantTaxInput,
} from "./tenantTaxSchema";

// ---- pure validation (no DB, safe to unit-test) ----------------------------

// TIN: exactly 12 digits, no spaces, no dashes. Empty string treated as
// "not yet filled" → returns null (lets the merchant clear the field).
export function normalizeTin(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed;
}

// BIN: exactly 10 digits, same normalization rules as TIN.
export function normalizeBin(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed;
}

import { TIN_REGEX, BIN_REGEX } from "./tenantTaxSchema";

// Result type for the pure validators. We throw a typed error (not a Zod
// throw) so callers in the Server Action can render a Bengali message.
export class TenantTaxValidationError extends Error {
  readonly code: "TIN_INVALID" | "BIN_INVALID";
  constructor(code: "TIN_INVALID" | "BIN_INVALID", message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "TenantTaxValidationError";
  }
}

export interface ValidatedTenantTax {
  tin: string | null;
  bin: string | null;
}

/** Validates raw form input. Throws TenantTaxValidationError on failure. */
export function validateTenantTax(input: {
  tin: unknown;
  bin: unknown;
}): ValidatedTenantTax {
  const tin = normalizeTin(input.tin);
  const bin = normalizeBin(input.bin);

  if (tin !== null && !TIN_REGEX.test(tin)) {
    throw new TenantTaxValidationError(
      "TIN_INVALID",
      "TIN অবশ্যই ১২ সংখ্যার হতে হবে।",
    );
  }
  if (bin !== null && !BIN_REGEX.test(bin)) {
    throw new TenantTaxValidationError(
      "BIN_INVALID",
      "BIN অবশ্যই ১০ সংখ্যার হতে হবে।",
    );
  }
  return { tin, bin };
}

// ---- DB-shaped types --------------------------------------------------------

export interface TenantTaxIds {
  tin: string | null;
  bin: string | null;
}

// ---- reads (tenant-safe) ----------------------------------------------------

/**
 * Read the tenant's TIN and BIN via withTenant (RLS enforced).
 *
 * Returns `{ tin: null, bin: null }` if the row is missing or the columns
 * are empty — never throws on the not-yet-filled case. The invoice renderer
 * silently skips the line when both are null.
 */
export async function getTenantTaxIds(
  tenantId: string,
  userId: string,
): Promise<TenantTaxIds> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ tin: string | null; bin: string | null }[]>`
      select tin, bin from tenant where id = ${tenantId} limit 1
    `,
  );
  const row = rows[0];
  return {
    tin: row?.tin ?? null,
    bin: row?.bin ?? null,
  };
}

// ---- writes (tenant-safe) ---------------------------------------------------

/**
 * Persist TIN and/or BIN on the tenant row. Accepts raw strings (already
 * validated by `validateTenantTax` / the Zod schema in the Server Action);
 * this function does NOT re-validate — callers must do that first. The DB
 * CHECK constraints are the last line of defense.
 *
 * Passing null for either column clears that field. Omitting a key (i.e.
 * the caller didn't include it in `patch`) leaves the column untouched.
 */
export async function saveTenantTaxIds(
  tenantId: string,
  userId: string,
  patch: { tin?: string | null; bin?: string | null },
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    // Build a dynamic SET list so we don't touch columns the caller didn't
    // intend to change. Undefined = leave alone, null = clear, string = set.
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (patch.tin !== undefined) {
      sets.push(`tin = $${p++}`);
      params.push(patch.tin);
    }
    if (patch.bin !== undefined) {
      sets.push(`bin = $${p++}`);
      params.push(patch.bin);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = now()");
    params.push(tenantId);

    // Safe: every interpolated value is a $N parameter placeholder, bound by
    // postgres.js — no untrusted strings ever land in the SET list.
    const sqlText = `update tenant set ${sets.join(", ")} where id = $${p}`;
    await tx.unsafe(sqlText, params as Parameters<typeof tx.unsafe>[1]);
  });
}