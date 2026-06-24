// DeltaAmount — signed, colored reconciliation amount (DESIGN §Q3.2 / §Q4).
//
// The reconciliation moat lives or dies on this reading unambiguously. Mono +
// tabular-nums so columns line up to the paisa; the sign is ALWAYS shown so the
// direction of money is never ambiguous. Color + sign together (§7.4 — never
// color alone):
//   over-remit  (+, courier paid MORE)  -> info / st-shipped (informational)
//   under-remit (−, courier owes)        -> warning
//   missing     (no remittance at all)   -> danger
//   matched     (Δ 0)                    -> cod green "✓ মিলেছে"
//
// Amount is the discrepancy in taka (expected − remitted). `missing` is passed
// explicitly because a delivered-but-unremitted shipment is the most serious
// case and must read as danger even though its numeric Δ equals the full expected.
import { cn } from "../lib/cn";

interface DeltaAmountProps {
  /** Discrepancy in taka: positive = courier owes (under), negative = over. */
  amount: number;
  /** True when a delivered shipment has NO remittance line at all (danger). */
  missing?: boolean;
  /** "bn" labels (default) or "en". Numerals stay Latin (operator surface). */
  lang?: "bn" | "en";
  className?: string;
}

function formatSigned(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  const grouped = Math.abs(amount)
    .toFixed(Number.isInteger(amount) ? 0 : 2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}৳${grouped}`;
}

export function DeltaAmount({ amount, missing = false, lang = "bn", className }: DeltaAmountProps) {
  const matched = !missing && amount === 0;
  const tone = missing
    ? "text-danger"
    : matched
      ? "text-cod"
      : amount > 0
        ? "text-warning"
        : "text-st-shipped";

  if (matched) {
    return (
      <span className={cn("font-mono text-sm font-semibold tnum text-cod", className)}>
        {lang === "bn" ? "✓ মিলেছে" : "✓ Matched"}
      </span>
    );
  }

  return (
    <span className={cn("font-mono text-sm font-semibold tnum", tone, className)}>
      {missing ? (lang === "bn" ? "রেমিট্যান্স নেই" : "No remittance") : formatSigned(amount)}
    </span>
  );
}
