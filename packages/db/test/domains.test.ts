// ============================================================================
// Custom-domain status state machine (PURE) — unit suite for lib/domains/state.
//
// No DB / no Redis / no fetch: this is the (verified, ssl_status) → DomainState
// mapping and the legal transitions the verify/poll flow applies. The state
// machine is the spine of the connect UI (DESIGN §Q5.2) — DNS-verified and
// SSL-issued are TWO states, and only ssl_issued may be set primary.
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  deriveDomainState,
  canSetPrimary,
  afterDnsVerified,
  afterSslIssued,
  asFailed,
  asRetry,
  routingChanged,
} from "../../../apps/web/lib/domains/state";

describe("deriveDomainState", () => {
  it("not-verified → pending_dns regardless of ssl", () => {
    expect(deriveDomainState({ verified: false, sslStatus: "none" })).toBe("pending_dns");
    expect(deriveDomainState({ verified: false, sslStatus: "pending" })).toBe("pending_dns");
  });

  it("verified + pending/none → dns_verified (cert issuing — NOT live)", () => {
    expect(deriveDomainState({ verified: true, sslStatus: "pending" })).toBe("dns_verified");
    expect(deriveDomainState({ verified: true, sslStatus: "none" })).toBe("dns_verified");
  });

  it("verified + issued → ssl_issued (genuinely live)", () => {
    expect(deriveDomainState({ verified: true, sslStatus: "issued" })).toBe("ssl_issued");
  });

  it("ssl_status=failed → failed (terminal-until-retry), even if verified", () => {
    expect(deriveDomainState({ verified: false, sslStatus: "failed" })).toBe("failed");
    expect(deriveDomainState({ verified: true, sslStatus: "failed" })).toBe("failed");
  });
});

describe("canSetPrimary", () => {
  it("only an ssl_issued (live) domain may be primary", () => {
    expect(canSetPrimary({ verified: true, sslStatus: "issued" })).toBe(true);
    expect(canSetPrimary({ verified: true, sslStatus: "pending" })).toBe(false);
    expect(canSetPrimary({ verified: false, sslStatus: "none" })).toBe(false);
    expect(canSetPrimary({ verified: true, sslStatus: "failed" })).toBe(false);
  });
});

describe("transitions", () => {
  it("afterDnsVerified advances pending_dns → dns_verified", () => {
    const next = afterDnsVerified({ verified: false, sslStatus: "none" });
    expect(next).toEqual({ verified: true, sslStatus: "pending" });
    expect(deriveDomainState(next)).toBe("dns_verified");
  });

  it("afterDnsVerified is idempotent once issued (never regresses SSL)", () => {
    const next = afterDnsVerified({ verified: true, sslStatus: "issued" });
    expect(next).toEqual({ verified: true, sslStatus: "issued" });
    expect(deriveDomainState(next)).toBe("ssl_issued");
  });

  it("afterSslIssued reaches the live state", () => {
    expect(deriveDomainState(afterSslIssued())).toBe("ssl_issued");
  });

  it("asFailed / asRetry move to failed then back to pending_dns", () => {
    expect(deriveDomainState(asFailed())).toBe("failed");
    expect(deriveDomainState(asRetry())).toBe("pending_dns");
  });
});

describe("routingChanged", () => {
  it("flips only when `verified` changes (cache-invalidation trigger)", () => {
    // DNS verification flips verified false→true: routing now resolvable.
    expect(
      routingChanged({ verified: false, sslStatus: "none" }, { verified: true, sslStatus: "pending" }),
    ).toBe(true);
    // SSL issuance (pending→issued) does NOT change routability.
    expect(
      routingChanged({ verified: true, sslStatus: "pending" }, { verified: true, sslStatus: "issued" }),
    ).toBe(false);
    // Removal/failure flips verified true→false: must bust the cache.
    expect(
      routingChanged({ verified: true, sslStatus: "issued" }, { verified: false, sslStatus: "failed" }),
    ).toBe(true);
  });
});
