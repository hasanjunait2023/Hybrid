// Custom-domain status state machine (blueprint §2.1, DESIGN §Q5.2). PURE — no
// DB, no env, no fetch. Maps the persisted (verified, ssl_status) pair on
// tenant_domain to the UI-facing connection state, and encodes the legal
// transitions the verify/poll flow may apply.
//
// The persisted columns are the source of truth; this module never invents a
// status the columns can't represent (the enum ssl_status is none/pending/
// issued/failed and `verified` is a boolean — see 01_schema.sql).

export type SslStatus = "none" | "pending" | "issued" | "failed";

/** The UI/connection state derived from the persisted row. */
export type DomainState =
  | "pending_dns" // records shown, DNS not yet verified
  | "dns_verified" // DNS matched, certificate issuing
  | "ssl_issued" // genuinely live + secure (HTTPS)
  | "failed"; // verification or SSL failed — never a dead end

export interface DomainRowStatus {
  verified: boolean;
  sslStatus: SslStatus;
}

/**
 * Derive the connection state from the persisted (verified, ssl_status) pair.
 *
 * - failed ssl_status is terminal-until-retry regardless of `verified`.
 * - not-verified  → pending_dns (still waiting on the DNS records).
 * - verified + issued → ssl_issued (live).
 * - verified + none/pending → dns_verified (cert issuing; DESIGN insists DNS-
 *   verified and SSL-issued are TWO states — never claim "live" before issued).
 */
export function deriveDomainState(row: DomainRowStatus): DomainState {
  if (row.sslStatus === "failed") return "failed";
  if (!row.verified) return "pending_dns";
  if (row.sslStatus === "issued") return "ssl_issued";
  return "dns_verified";
}

/** Only an ssl_issued (genuinely live) domain may be set primary (DESIGN §Q5.2). */
export function canSetPrimary(row: DomainRowStatus): boolean {
  return deriveDomainState(row) === "ssl_issued";
}

/** The next persisted (verified, ssl_status) after a successful DNS verification. */
export function afterDnsVerified(row: DomainRowStatus): DomainRowStatus {
  // Idempotent: once issued, re-verifying must not regress the SSL state.
  if (row.sslStatus === "issued") return { verified: true, sslStatus: "issued" };
  return { verified: true, sslStatus: "pending" };
}

/** The next persisted pair once the certificate is confirmed issued. */
export function afterSslIssued(): DomainRowStatus {
  return { verified: true, sslStatus: "issued" };
}

/** Mark the row failed (no TXT / wrong value / CAA blocked / timeout). */
export function asFailed(): DomainRowStatus {
  return { verified: false, sslStatus: "failed" };
}

/** Reset a failed row back to pending so the seller can retry (DESIGN §Q5.2). */
export function asRetry(): DomainRowStatus {
  return { verified: false, sslStatus: "none" };
}

/**
 * Whether transitioning ssl_issued → live affects host routing. The resolve.ts
 * cache must be invalidated exactly when a domain BECOMES routable (verified
 * flips true) or stops being routable, so the next request re-resolves.
 */
export function routingChanged(prev: DomainRowStatus, next: DomainRowStatus): boolean {
  return prev.verified !== next.verified;
}
