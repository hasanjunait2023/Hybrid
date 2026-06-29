import "server-only";

// Wholesale buyer session helpers (Phase 3). Extends the marketplace session
// layer with B2B verification status lookup.
import { getBuyerSession } from "./session";
import { asPlatformAdmin } from "@hybrid/db";

/**
 * B2B buyer verification types.
 * - end_consumer: retail buyer, not B2B verified
 * - retailer: verified retailer (buys wholesale for resale)
 * - distributor: verified distributor
 * - wholesaler: verified wholesaler
 * - unknown: anonymous or not found
 */
export type BuyerVerifiedType =
  | "end_consumer"
  | "retailer"
  | "distributor"
  | "wholesaler"
  | "unknown";

/**
 * Resolve the current buyer's B2B verification type.
 * Returns 'unknown' for anonymous visitors.
 * For logged-in buyers, reads customer_type from marketplace_customer.
 */
export async function getBuyerVerifiedType(): Promise<BuyerVerifiedType> {
  const session = await getBuyerSession();
  if (!session) return "unknown";

  const rows = await asPlatformAdmin((tx) =>
    tx<{ customer_type: string }[]>`
      select customer_type
        from marketplace_customer
       where id = ${session.buyerId}
       limit 1
    `,
  );
  const ct = rows[0]?.customer_type;
  if (!ct) return "unknown";

  // Validate against known types
  const valid: BuyerVerifiedType[] = [
    "end_consumer",
    "retailer",
    "distributor",
    "wholesaler",
  ];
  if (valid.includes(ct as BuyerVerifiedType)) {
    return ct as BuyerVerifiedType;
  }
  return "unknown";
}

/**
 * Check if the current buyer is verified B2B (retailer, distributor, or wholesaler).
 * Anonymous and end_consumer return false.
 */
export async function isVerifiedB2B(): Promise<boolean> {
  const type = await getBuyerVerifiedType();
  return type === "retailer" || type === "distributor" || type === "wholesaler";
}
