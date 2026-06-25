// Locale-aware numeral + money formatting. Wraps the @hybrid/ui formatters so
// digits follow the active locale: English → Latin (1,899), Bangla → Bangla
// numerals (১,৮৯৯). The DB value is always a Latin number; this is view-only.
import { formatBdtBangla, formatBdtLatin, toBnDigits } from "@hybrid/ui";
import type { Locale } from "./config";

/** Money in BDT, digits localized to the active locale. */
export function formatMoney(amount: number, locale: Locale): string {
  return locale === "bn" ? formatBdtBangla(amount) : formatBdtLatin(amount);
}

/** A plain integer/number with locale-correct digits (no currency mark). */
export function formatNumber(value: number | string, locale: Locale): string {
  return locale === "bn" ? toBnDigits(value) : String(value);
}
