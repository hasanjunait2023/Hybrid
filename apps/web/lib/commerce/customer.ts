// Shared commerce core — customer upsert (blueprint "apps/web shared cores").
// Both the storefront checkout slice and the manual-order slice call this.
//
// Operates on the `tx` handle already opened by withTenant in placeOrder — it
// does NOT open its own transaction, so the whole order is one atomic unit
// (a throw anywhere rolls back the customer write too).
import type { Tx } from "@hybrid/db";

export interface UpsertCustomerInput {
  /** Natural key in BD. Required — drives the customer_phone_uniq partial index. */
  phone: string;
  name: string;
  /** Optional; citext column. */
  email?: string | null;
}

// Upsert by (tenant_id, phone) via the customer_phone_uniq partial unique index
// (`where phone is not null`). The conflict target must name that partial
// predicate so Postgres selects the partial index. Returns the customer id.
export async function upsertCustomerByPhone(
  tx: Tx,
  tenantId: string,
  input: UpsertCustomerInput,
): Promise<string> {
  const rows = await tx<{ id: string }[]>`
    insert into customer (tenant_id, phone, name, email)
    values (${tenantId}, ${input.phone}, ${input.name}, ${input.email ?? null})
    on conflict (tenant_id, phone) where phone is not null
      do update set
        name = excluded.name,
        email = coalesce(excluded.email, customer.email),
        updated_at = now()
    returning id
  `;
  return rows[0]!.id;
}
