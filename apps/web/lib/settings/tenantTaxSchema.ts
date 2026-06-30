// =============================================================================
// O13 — TIN / BIN validation primitives (client-safe, no DB).
//
// Split out of tenantTax.ts so client components (TaxForm) can import the
// regex + Zod schema without dragging in @hybrid/db (which pulls in the
// server-only postgres.js driver and breaks the Next.js client bundle).
// =============================================================================

import { z } from "zod";

// TIN: exactly 12 digits, no spaces, no dashes. Empty string is valid input
// (clears the column) — the schema refinement skips validation for "".
export const TIN_REGEX = /^[0-9]{12}$/;
export const BIN_REGEX = /^[0-9]{10}$/;

// Same shape as the Server Action uses. Bengali-friendly messages so the UI
// can show them verbatim without i18n plumbing.
export const TenantTaxInput = z.object({
  tin: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || TIN_REGEX.test(v), {
      message: "TIN অবশ্যই ১২ সংখ্যার হতে হবে।",
    })
    .optional()
    .default(""),
  bin: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || BIN_REGEX.test(v), {
      message: "BIN অবশ্যই ১০ সংখ্যার হতে হবে।",
    })
    .optional()
    .default(""),
});