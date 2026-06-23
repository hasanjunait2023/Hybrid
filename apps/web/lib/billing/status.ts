// Billing state machine (blueprint S-BILLING; GATE-1: 14-day trial, 3-day grace).
//
// PURE + testable: no DB, no env, no clock-of-its-own. Given a subscription's
// current status + its period end (the trial/billing-cycle boundary set at
// provision = now()+14d) + the current time, it computes the next subscription
// status and whether the tenant must be SUSPENDED.
//
// The grace model (manual billing, Phase 1 — no live SaaS charge yet):
//
//   trialing ──(period_end passed)──▶ past_due ──(+3d grace passed)──▶ suspended
//   active   ──(period_end passed)──▶ past_due ──(+3d grace passed)──▶ suspended
//
// Why two status namespaces. subscription_status has no 'suspended' value and
// tenant_status has no 'trialing' value (see sql/01_schema.sql enums). So the
// machine speaks BOTH: it returns the next *subscription* status AND a separate
// boolean for the *tenant* action (flip tenant.status -> 'suspended'). During
// the grace window the subscription is 'past_due' but the tenant stays live —
// resolve.ts only refuses status != 'active', so grace keeps the storefront up.
//
// Terminal states (cancelled, expired) never auto-transition here.

// Grace allowed after a subscription goes past_due before the store is cut off.
const GRACE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Mirrors subscription_status (sql/01_schema.sql). 'suspended' is deliberately
// absent — that lives on tenant_status, expressed via the `suspendTenant` flag.
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

export interface BillingSubscriptionState {
  status: SubscriptionStatus;
  /** Trial / billing-cycle boundary. null = no period set (treated as not-yet-due). */
  currentPeriodEnd: Date | null;
}

export interface BillingDecision {
  /** The subscription status after evaluating against `now`. */
  status: SubscriptionStatus;
  /** True only when the 3-day grace past period_end is exhausted: suspend the tenant. */
  suspendTenant: boolean;
  /** True when this decision changes the subscription status from its input. */
  statusChanged: boolean;
  /** Stable, machine-readable reason (also doubles as an audit/log string). */
  reason:
    | "within_period"
    | "no_period"
    | "trial_expired"
    | "period_expired"
    | "in_grace"
    | "grace_exhausted"
    | "terminal";
}

function graceDeadline(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() + GRACE_DAYS * MS_PER_DAY);
}

// The whole machine. Pure: same inputs -> same output, no side effects.
export function evaluateTenantBilling(
  sub: BillingSubscriptionState,
  now: Date,
): BillingDecision {
  // Terminal subscriptions are left untouched (manual reactivation / re-signup).
  if (sub.status === "cancelled" || sub.status === "expired") {
    return {
      status: sub.status,
      suspendTenant: false,
      statusChanged: false,
      reason: "terminal",
    };
  }

  // No period boundary set yet — nothing to expire against. Hold current status.
  if (!sub.currentPeriodEnd) {
    return {
      status: sub.status,
      suspendTenant: false,
      statusChanged: false,
      reason: "no_period",
    };
  }

  const periodEnd = sub.currentPeriodEnd;

  // trialing / active, still inside the paid/trial window: no change.
  if ((sub.status === "trialing" || sub.status === "active") && now <= periodEnd) {
    return {
      status: sub.status,
      suspendTenant: false,
      statusChanged: false,
      reason: "within_period",
    };
  }

  // trialing / active, window has passed: move to past_due. Grace clock starts
  // at period_end, so a brand-new past_due is never instantly suspended.
  if (sub.status === "trialing" || sub.status === "active") {
    return {
      status: "past_due",
      suspendTenant: false,
      statusChanged: true,
      reason: sub.status === "trialing" ? "trial_expired" : "period_expired",
    };
  }

  // Already past_due: still in grace, or grace exhausted -> suspend the tenant.
  // (Subscription stays 'past_due'; the suspension is a tenant_status action.)
  if (now > graceDeadline(periodEnd)) {
    return {
      status: "past_due",
      suspendTenant: true,
      statusChanged: false,
      reason: "grace_exhausted",
    };
  }

  return {
    status: "past_due",
    suspendTenant: false,
    statusChanged: false,
    reason: "in_grace",
  };
}
