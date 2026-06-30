// Core sync engine — imports/exports products, inventory, and orders
// between external platforms and Hybrid's internal catalog.
//
// Tenant data writes (product/variant/order) use withTenant(tenantId, null)
// so RLS is enforced. Platform infrastructure (entity map, sync log) uses
// asPlatformAdmin — those tables are cross-tenant by design.
import { withTenant } from "@hybrid/db";
import {
  getEntityMap,
  upsertEntityMap,
  createSyncLog,
  finishSyncLog,
  openIntegrationCredentials,
} from "./data";
import { getAdapter } from "./adapters";
import type { ExternalProduct, ExternalOrder, SyncEntityType } from "./types";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function runProductImport(
  integrationId: string,
  tenantId: string,
  credentials: string,
  trigger: "manual" | "webhook" | "scheduled",
): Promise<{ synced: number; failed: number }> {
  const logId = await createSyncLog(integrationId, tenantId, "product", "import", trigger);
  let synced = 0;
  let failed = 0;

  try {
    const creds = openIntegrationCredentials(credentials);
    const adapter = getAdapter(creds);
    const products = await adapter.fetchProducts();

    for (const product of products) {
      try {
        await upsertProduct(integrationId, tenantId, product);
        synced++;
      } catch {
        failed++;
      }
    }

    await finishSyncLog(logId, failed === 0 ? "success" : synced > 0 ? "partial" : "error", synced, failed);
  } catch (err) {
    await finishSyncLog(logId, "error", synced, failed, String(err));
    throw err;
  }

  return { synced, failed };
}

export async function runInventoryExport(
  integrationId: string,
  tenantId: string,
  credentials: string,
  trigger: "manual" | "webhook" | "scheduled",
): Promise<{ synced: number; failed: number }> {
  const logId = await createSyncLog(integrationId, tenantId, "inventory", "export", trigger);
  let synced = 0;
  let failed = 0;

  try {
    const creds = openIntegrationCredentials(credentials);
    const adapter = getAdapter(creds);

    // Fetch all variants with their current inventory from Hybrid
    const variants = await withTenant(tenantId, null, (tx) =>
      tx<{ id: string; inventory_quantity: number; integration_ext_id: string | null }[]>`
        select v.id, v.inventory_quantity,
               eem.external_id as integration_ext_id
        from product_variant v
        join product p on p.id = v.product_id
        left join external_entity_map eem
          on eem.internal_id = v.id::text
         and eem.integration_id = ${integrationId}
         and eem.entity_type = 'variant'
        where p.tenant_id = ${tenantId}
          and eem.external_id is not null
      `,
    );

    for (const variant of variants) {
      if (!variant.integration_ext_id) continue;
      try {
        await adapter.updateInventory(variant.integration_ext_id, variant.inventory_quantity);
        synced++;
      } catch {
        failed++;
      }
    }

    await finishSyncLog(logId, failed === 0 ? "success" : synced > 0 ? "partial" : "error", synced, failed);
  } catch (err) {
    await finishSyncLog(logId, "error", synced, failed, String(err));
    throw err;
  }

  return { synced, failed };
}

export async function runOrderImport(
  integrationId: string,
  tenantId: string,
  credentials: string,
  trigger: "manual" | "webhook" | "scheduled",
  since?: string,
): Promise<{ synced: number; failed: number }> {
  const logId = await createSyncLog(integrationId, tenantId, "order", "import", trigger);
  let synced = 0;
  let failed = 0;

  try {
    const creds = openIntegrationCredentials(credentials);
    const adapter = getAdapter(creds);
    const orders = await adapter.fetchOrders(since);

    for (const order of orders) {
      try {
        await upsertOrder(integrationId, tenantId, order);
        synced++;
      } catch {
        failed++;
      }
    }

    await finishSyncLog(logId, failed === 0 ? "success" : synced > 0 ? "partial" : "error", synced, failed);
  } catch (err) {
    await finishSyncLog(logId, "error", synced, failed, String(err));
    throw err;
  }

  return { synced, failed };
}

// ---------------------------------------------------------------------------
// Webhook event dispatcher
// ---------------------------------------------------------------------------

export async function handleWebhookEvent(
  integrationId: string,
  tenantId: string,
  credentials: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (topic.startsWith("products/") || topic.includes("product")) {
    const product = payloadToExternalProduct(payload);
    if (product) await upsertProduct(integrationId, tenantId, product);
  } else if (topic.startsWith("orders/") || topic.includes("order")) {
    const order = payloadToExternalOrder(payload);
    if (order) await upsertOrder(integrationId, tenantId, order);
  } else if (topic.includes("inventory") || topic.includes("stock")) {
    // Best-effort: pull full product to get updated inventory
    await runProductImport(integrationId, tenantId, credentials, "webhook");
  }
}

// ---------------------------------------------------------------------------
// Internal upsert helpers
// ---------------------------------------------------------------------------

async function upsertProduct(
  integrationId: string,
  tenantId: string,
  product: ExternalProduct,
): Promise<void> {
  const hash = hashPayload(product);
  const existing = await getEntityMap(integrationId, "product", product.externalId);

  if (existing?.externalHash === hash) return; // unchanged

  if (existing) {
    // Update existing product (no images column — images live in product_image)
    await withTenant(tenantId, null, async (tx) => {
      await tx`
        update product
        set title       = ${product.title},
            description = ${product.description},
            status      = ${product.status},
            tags        = ${product.tags ?? []},
            updated_at  = now()
        where id = ${existing.internalId} and tenant_id = ${tenantId}
      `;
      if (product.images.length > 0) {
        await tx`delete from product_image where product_id = ${existing.internalId}`;
        for (let pos = 0; pos < product.images.length; pos++) {
          await tx`
            insert into product_image (tenant_id, product_id, url, position)
            values (${tenantId}, ${existing.internalId}, ${product.images[pos]!}, ${pos})
          `;
        }
      }
    });

    for (const variant of product.variants) {
      await upsertVariant(integrationId, tenantId, existing.internalId, variant);
    }

    // tenantId first — matches upsertEntityMap(tenantId, integrationId, ...) signature
    await upsertEntityMap(tenantId, integrationId, "product", product.externalId, existing.internalId, hash);
  } else {
    // Insert new product. Slug is derived from title + externalId for determinism
    // and near-uniqueness without relying on Math.random().
    const productId = await withTenant(tenantId, null, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into product (tenant_id, title, description, status, tags, slug)
        values (
          ${tenantId},
          ${product.title},
          ${product.description},
          ${product.status},
          ${product.tags ?? []},
          ${slugify(product.title, product.externalId)}
        )
        on conflict (tenant_id, slug) do update set slug = excluded.slug || '-x'
        returning id
      `;
      const pid = rows[0]!.id;
      for (let pos = 0; pos < product.images.length; pos++) {
        await tx`
          insert into product_image (tenant_id, product_id, url, position)
          values (${tenantId}, ${pid}, ${product.images[pos]!}, ${pos})
        `;
      }
      return pid;
    });

    for (const variant of product.variants) {
      await upsertVariant(integrationId, tenantId, productId, variant);
    }

    await upsertEntityMap(tenantId, integrationId, "product", product.externalId, productId, hash);
  }
}

async function upsertVariant(
  integrationId: string,
  tenantId: string,
  productId: string,
  variant: ExternalProduct["variants"][number],
): Promise<void> {
  const existing = await getEntityMap(integrationId, "variant", variant.externalId);

  if (existing) {
    await withTenant(tenantId, null, (tx) =>
      tx`
        update product_variant
        set sku                = ${variant.sku ?? null},
            title              = ${variant.title},
            price              = ${variant.price},
            compare_at_price   = ${variant.compareAtPrice ?? null},
            inventory_quantity = ${variant.inventory},
            options            = ${JSON.stringify(variant.options ?? {})}::jsonb,
            updated_at         = now()
        where id = ${existing.internalId} and product_id = ${productId}
      `,
    );
  } else {
    const rows = await withTenant(tenantId, null, (tx) =>
      tx<{ id: string }[]>`
        insert into product_variant
          (product_id, tenant_id, sku, title, price, compare_at_price, inventory_quantity, options)
        values (
          ${productId},
          ${tenantId},
          ${variant.sku ?? null},
          ${variant.title},
          ${variant.price},
          ${variant.compareAtPrice ?? null},
          ${variant.inventory},
          ${JSON.stringify(variant.options ?? {})}::jsonb
        )
        returning id
      `,
    );
    const variantId = rows[0]!.id;
    await upsertEntityMap(tenantId, integrationId, "variant", variant.externalId, variantId);
  }
}

async function upsertOrder(
  integrationId: string,
  tenantId: string,
  order: ExternalOrder,
): Promise<void> {
  const hash = hashPayload(order);
  const existing = await getEntityMap(integrationId, "order", order.externalId);
  if (existing?.externalHash === hash) return;

  if (existing) {
    // Update updated_at only — external status doesn't map reliably to our enum
    await withTenant(tenantId, null, (tx) =>
      tx`
        update orders
        set updated_at = now()
        where id = ${existing.internalId} and tenant_id = ${tenantId}
      `,
    );
    await upsertEntityMap(tenantId, integrationId, "order", order.externalId, existing.internalId, hash);
  } else {
    // Pre-fetch variant maps before opening the tenant transaction to avoid
    // nested connections (each withTenant/asPlatformAdmin opens a new one).
    const variantMapByExtId = new Map<string, string | null>();
    for (const li of order.lineItems) {
      if (li.externalVariantId) {
        const vm = await getEntityMap(integrationId, "variant", li.externalVariantId);
        variantMapByExtId.set(li.externalVariantId, vm?.internalId ?? null);
      }
    }

    // Upsert customer, insert order, and insert all line items in one transaction.
    const orderId = await withTenant(tenantId, null, async (tx) => {
      let customerId: string | null = null;
      if (order.customerPhone) {
        const custRows = await tx<{ id: string }[]>`
          insert into customer (tenant_id, phone, name)
          values (${tenantId}, ${order.customerPhone!}, ${order.customerName ?? ""})
          on conflict (tenant_id, phone) do update set name = excluded.name
          returning id
        `;
        customerId = custRows[0]?.id ?? null;
      }

      const shippingAddr = JSON.stringify({
        recipient: order.shippingAddress?.name ?? order.customerName ?? "",
        phone: order.shippingAddress?.phone ?? order.customerPhone ?? "",
        line: order.shippingAddress?.line1 ?? "",
        district: order.shippingAddress?.district ?? "",
        city: order.shippingAddress?.city ?? "",
      });
      const rows = await tx<{ id: string }[]>`
        insert into orders
          (tenant_id, customer_id, customer_name, customer_phone,
           shipping_address, grand_total, source,
           note)
        values (
          ${tenantId},
          ${customerId},
          ${order.shippingAddress?.name ?? order.customerName ?? null},
          ${order.customerPhone ?? null},
          ${shippingAddr}::jsonb,
          ${order.totalAmount},
          'api'::order_source,
          ${order.orderNumber ? `External #${order.orderNumber}` : null}
        )
        returning id
      `;
      const oid = rows[0]!.id;

      for (const li of order.lineItems) {
        const variantInternalId = li.externalVariantId
          ? variantMapByExtId.get(li.externalVariantId) ?? null
          : null;
        await tx`
          insert into order_item
            (order_id, tenant_id, variant_id, title, quantity, unit_price, line_total)
          values (
            ${oid},
            ${tenantId},
            ${variantInternalId},
            ${li.title},
            ${li.qty},
            ${li.unitPrice},
            ${li.unitPrice * li.qty}
          )
        `;
      }
      return oid;
    });

    await upsertEntityMap(tenantId, integrationId, "order", order.externalId, orderId, hash);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPayload(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);
}

function slugify(title: string, externalId: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  // Use the last 6 chars of externalId (stripped to alnum) as a deterministic,
  // per-product suffix so the same external product always maps to the same slug
  // and two different products with identical titles still get distinct slugs.
  const suffix = externalId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase() || "ext";
  return `${base}-${suffix}`.replace(/^-|-$/g, "");
}

function payloadToExternalProduct(payload: Record<string, unknown>): ExternalProduct | null {
  if (!payload.id) return null;
  const id = String(payload.id);
  return {
    externalId: id,
    title: String(payload.title ?? payload.name ?? id),
    description: String(payload.body_html ?? payload.description ?? "")
      .replace(/<[^>]*>/g, " ")
      .trim(),
    images: Array.isArray(payload.images)
      ? (payload.images as { src: string }[]).map((i) => i.src)
      : [],
    status:
      payload.status === "active" || payload.status === "publish" ? "active" : "draft",
    tags: [],
    variants: [
      {
        externalId: id,
        title: "Default",
        price: parseFloat(String(payload.price ?? 0)),
        inventory: parseInt(String(payload.inventory_quantity ?? payload.stock_quantity ?? 0), 10),
      },
    ],
  };
}

function payloadToExternalOrder(payload: Record<string, unknown>): ExternalOrder | null {
  if (!payload.id) return null;
  return {
    externalId: String(payload.id),
    orderNumber: String(payload.name ?? payload.number ?? payload.id),
    createdAt: String(payload.created_at ?? payload.date_created ?? new Date().toISOString()),
    status: String(payload.fulfillment_status ?? payload.status ?? "pending"),
    totalAmount: parseFloat(String(payload.total_price ?? payload.total ?? 0)),
    paymentMethod: String(payload.gateway ?? payload.payment_method ?? ""),
    lineItems: [],
  };
}

// Re-export types needed by callers
export type { SyncEntityType };
