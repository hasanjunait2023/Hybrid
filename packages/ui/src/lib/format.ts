// Numeral + money formatting (DESIGN §4.4).
//
// The underlying value is ALWAYS Latin in the DB; we convert at the view layer.
//   - Storefront (customer-facing): Bangla numerals via toBnDigits.
//   - Admin / super-admin (operator-facing): Latin numerals + tabular-nums.

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Convert any Latin digits in a string/number to Bangla numerals. */
export function toBnDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/**
 * Storefront price, e.g. ৳৪৯৯. Strips trailing .00 (whole-taka is the norm),
 * keeps paisa only when present, then renders in Bangla numerals with the ৳ mark.
 */
export function formatBdtBangla(amount: number): string {
  const whole = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  const grouped = groupThousands(whole);
  return `৳${toBnDigits(grouped)}`;
}

/** Admin price, e.g. ৳499 — Latin numerals for fast data entry / reconciliation. */
export function formatBdtLatin(amount: number): string {
  const whole = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return `৳${groupThousands(whole)}`;
}

// South-Asian commerce uses Western thousands grouping for BDT in practice
// (৳1,899). Operate on the integer portion only.
function groupThousands(numeric: string): string {
  const [intPart, fraction] = numeric.split(".");
  const grouped = (intPart ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
