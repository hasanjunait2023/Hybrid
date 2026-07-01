// Canonical Bangladesh mobile-number normalization.
//
// BD mobile numbers are 11 digits in local form: 01[3-9]XXXXXXXX. Users type them
// many ways — "01712-345678", "+8801712345678", "8801712345678", "01712 345678".
// Stored inconsistently they fracture a person's identity: the marketplace uses
// phone as a UNIQUE natural key (marketplace_customer.phone), so two spellings of
// the same number become two buyer accounts with split order history. Normalize
// at every entry point that keys on phone.
//
// Returns the canonical local form "01XXXXXXXXX", or null when the input is not a
// recognisable BD mobile number (caller should reject with a friendly message).
const BD_LOCAL = /^01[3-9]\d{8}$/;

export function normalizeBdPhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");

  let local: string;
  if (digits.length === 13 && digits.startsWith("880")) {
    local = `0${digits.slice(3)}`; // 8801XXXXXXXXX → 01XXXXXXXXX
  } else if (digits.length === 11 && digits.startsWith("01")) {
    local = digits; // already local
  } else if (digits.length === 10 && digits.startsWith("1")) {
    local = `0${digits}`; // missing leading zero
  } else {
    return null;
  }

  return BD_LOCAL.test(local) ? local : null;
}
