// Internal analytics events (blueprint 2.7). Writes order.placed / product.viewed
// / cart.added rows to the tenant-scoped analytics_event table via withTenant
// (RLS enforced). These are first-party, always-on records — independent of the
// external GA4/Meta integrations and never flag-gated.
//
// NON-BLOCKING by contract when called from a post-commit hook: a failed insert
// must never surface to the buyer or roll back a committed order. writeOrderPlaced
// swallows + logs. The product.viewed / cart.added writers are exported for the
// storefront server paths that record them.
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import type { InternalEventType } from "./events";

type Jsonb = Parameters<Tx["json"]>[0];

interface InternalEventInput {
  type: InternalEventType;
  sessionId?: string | null;
  customerId?: string | null;
  payload?: Record<string, unknown>;
}

// Insert one analytics_event row inside the caller's tenant context.
async function insertEvent(
  tx: Tx,
  tenantId: string,
  input: InternalEventInput,
): Promise<void> {
  await tx`
    insert into analytics_event (tenant_id, type, session_id, customer_id, payload)
    values (
      ${tenantId}, ${input.type}, ${input.sessionId ?? null}, ${input.customerId ?? null},
      ${tx.json((input.payload ?? {}) as Jsonb)}
    )
  `;
}

// Record an internal event in a fresh withTenant txn. Throws on DB error (caller
// decides whether to swallow — the post-commit order path uses writeOrderPlaced
// which is non-blocking).
export async function recordInternalEvent(
  tenantId: string,
  userId: string | null,
  input: InternalEventInput,
): Promise<void> {
  await withTenant(tenantId, userId, (tx) => insertEvent(tx, tenantId, input));
}

// NON-BLOCKING product.viewed record — fire from PDP server component.
export async function writeProductViewed(
  tenantId: string,
  args: { productId: string; productSlug: string; title: string },
): Promise<void> {
  try {
    await recordInternalEvent(tenantId, null, {
      type: "product.viewed",
      payload: args,
    });
  } catch {
    // Never block the page render on analytics failure.
  }
}

// NON-BLOCKING cart.added record — fire from the cart-add server action.
export async function writeCartAdded(
  tenantId: string,
  args: { productId: string; productSlug: string; variantId: string; title: string; price: number; qty: number },
): Promise<void> {
  try {
    await recordInternalEvent(tenantId, null, {
      type: "cart.added",
      payload: args,
    });
  } catch {
    // Never block the cart action on analytics failure.
  }
}

// NON-BLOCKING lp.viewed record — fire from LP server component.
export async function writeLpViewed(
  tenantId: string,
  args: { slug: string; abVariant: "a" | "b" },
): Promise<void> {
  try {
    await recordInternalEvent(tenantId, null, {
      type: "lp.viewed",
      payload: args,
    });
  } catch {
    // Never block the page render on analytics failure.
  }
}

// Post-commit order.placed record. NON-BLOCKING: always resolves, never throws.
export async function writeOrderPlaced(
  tenantId: string,
  args: {
    orderId: string;
    orderNumber: number;
    customerId?: string | null;
    value: number;
    eventId: string;
  },
): Promise<void> {
  try {
    await recordInternalEvent(tenantId, null, {
      type: "order.placed",
      customerId: args.customerId ?? null,
      payload: {
        orderId: args.orderId,
        orderNumber: args.orderNumber,
        value: args.value,
        eventId: args.eventId,
      },
    });
  } catch (error) {
    console.error(`[analytics] order.placed write failed (order #${args.orderNumber}):`, error);
  }
}
