// O9 — Order tag actions (sprint 3).
//
// Tiny server action that adds or removes a single tag on an order.
// The admin UI calls it when the merchant toggles a chip on the order
// detail page or from the bulk action bar. RLS-safe via withTenant;
// only the tenant that owns the order can mutate its tags.
"use server";

import { revalidateTag } from "next/cache";
import { withTenant } from "@hybrid/db";
import { requireSession } from "@/lib/auth/requireSession";

export interface OrderTagResult {
  ok: boolean;
  tags?: string[];
  error?: string;
}

// Set the full tag set in one call (idempotent). Used by the order
// detail page when the merchant edits a tag chip group.
export async function setOrderTags(
  orderId: string,
  tags: string[],
): Promise<OrderTagResult> {
  const session = await requireSession();
  if (!session.tenantId) {
    return { ok: false, error: "no tenant context" };
  }
  const cleanTags = Array.from(
    new Set(
      tags
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0 && t.length <= 32)
        .slice(0, 20),
    ),
  );

  try {
    const out = await withTenant(session.tenantId, session.userId, async (tx) => {
      // CHECK the order exists + belongs to this tenant (RLS does this
      // for us; the SELECT is just so we can return the new tags).
      const exists = await tx<{ tags: string[] }[]>`
        update orders
           set tags = ${cleanTags}::text[],
               updated_at = now()
         where id = ${orderId}
        returning tags
      `;
      return exists[0]?.tags ?? cleanTags;
    });
    revalidateTag(`tenant:${session.tenantId}:orders`);
    return { ok: true, tags: out };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: msg };
  }
}

// Add a single tag (no-op if already present). Returns the new tag set.
export async function addOrderTag(
  orderId: string,
  tag: string,
): Promise<OrderTagResult> {
  const session = await requireSession();
  if (!session.tenantId) {
    return { ok: false, error: "no tenant context" };
  }
  const clean = String(tag).trim();
  if (!clean) return { ok: false, error: "empty tag" };

  try {
    const out = await withTenant(session.tenantId, session.userId, async (tx) => {
      const exists = await tx<{ tags: string[] }[]>`
        update orders
           set tags = array_append(
             case when tags is null then '{}'::text[] else tags end,
             ${clean}
           ),
           updated_at = now()
         where id = ${orderId}
           and not (${clean} = any(coalesce(tags, '{}'::text[])))
        returning tags
      `;
      // If the tag was already there, just return the current set.
      if (exists.length > 0) return exists[0]?.tags ?? [];
      const current = await tx<{ tags: string[] }[]>`
        select tags from orders where id = ${orderId}
      `;
      return current[0]?.tags ?? [];
    });
    revalidateTag(`tenant:${session.tenantId}:orders`);
    return { ok: true, tags: out };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: msg };
  }
}

// Remove a single tag. No-op if the tag wasn't on the order.
export async function removeOrderTag(
  orderId: string,
  tag: string,
): Promise<OrderTagResult> {
  const session = await requireSession();
  if (!session.tenantId) {
    return { ok: false, error: "no tenant context" };
  }
  const clean = String(tag).trim();
  if (!clean) return { ok: false, error: "empty tag" };

  try {
    const out = await withTenant(session.tenantId, session.userId, async (tx) => {
      const exists = await tx<{ tags: string[] }[]>`
        update orders
           set tags = array_remove(coalesce(tags, '{}'::text[]), ${clean}),
               updated_at = now()
         where id = ${orderId}
        returning tags
      `;
      return exists[0]?.tags ?? [];
    });
    revalidateTag(`tenant:${session.tenantId}:orders`);
    return { ok: true, tags: out };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: msg };
  }
}
