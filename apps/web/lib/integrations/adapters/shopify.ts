// Shopify Admin REST API adapter (2024-01 API version).
// Normalises Shopify product/order responses to the platform-agnostic types.
import type { PlatformAdapter, ExternalProduct, ExternalVariant, ExternalOrder, ShopifyCredentials } from "../types";

const API_VERSION = "2024-01";

export class ShopifyAdapter implements PlatformAdapter {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(creds: ShopifyCredentials) {
    const host = creds.shop_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.baseUrl = `https://${host}/admin/api/${API_VERSION}`;
    this.token = creds.access_token;
  }

  private async req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "X-Shopify-Access-Token": this.token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shopify API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async testConnection(): Promise<void> {
    await this.req("/shop.json");
  }

  async fetchProducts(): Promise<ExternalProduct[]> {
    let products: ExternalProduct[] = [];
    let pageInfo: string | undefined;

    do {
      const params = new URLSearchParams({ limit: "250" });
      if (pageInfo) params.set("page_info", pageInfo);

      const data = await this.req<{ products: ShopifyProduct[] }>(
        `/products.json?${params.toString()}`,
      );

      products = products.concat(data.products.map(mapShopifyProduct));

      // Shopify uses Link header for cursor pagination
      pageInfo = undefined; // simplified: single page for MVP
    } while (pageInfo);

    return products;
  }

  async fetchOrders(since?: string): Promise<ExternalOrder[]> {
    const params = new URLSearchParams({ limit: "250", status: "any" });
    if (since) params.set("created_at_min", since);

    const data = await this.req<{ orders: ShopifyOrder[] }>(
      `/orders.json?${params.toString()}`,
    );
    return data.orders.map(mapShopifyOrder);
  }

  async updateInventory(externalVariantId: string, qty: number): Promise<void> {
    // Get inventory item id from variant
    const varData = await this.req<{ variant: { inventory_item_id: number } }>(
      `/variants/${externalVariantId}.json`,
    );
    const inventoryItemId = varData.variant.inventory_item_id;

    // Get first location
    const locData = await this.req<{ locations: { id: number }[] }>("/locations.json");
    const locationId = locData.locations[0]?.id;
    if (!locationId) return;

    await this.req("/inventory_levels/set.json", "POST", {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: qty,
    });
  }
}

// ---------------------------------------------------------------------------
// Shopify response types (minimal — only fields we use)
// ---------------------------------------------------------------------------

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  status: string;
  tags: string;
  images: { src: string }[];
  variants: ShopifyVariant[];
}

interface ShopifyVariant {
  id: number;
  sku: string;
  title: string;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  image_id: number | null;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  fulfillment_status: string | null;
  financial_status: string;
  total_price: string;
  gateway: string;
  customer?: { phone?: string; first_name?: string; last_name?: string };
  shipping_address?: { name?: string; phone?: string; address1?: string; city?: string };
  line_items: {
    product_id: number;
    variant_id: number;
    title: string;
    quantity: number;
    price: string;
  }[];
}

function mapShopifyProduct(p: ShopifyProduct): ExternalProduct {
  return {
    externalId: String(p.id),
    title: p.title,
    description: p.body_html.replace(/<[^>]*>/g, " ").trim(),
    images: p.images.map((i) => i.src),
    status: p.status === "active" ? "active" : p.status === "draft" ? "draft" : "archived",
    tags: p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    variants: p.variants.map((v) => ({
      externalId: String(v.id),
      sku: v.sku || undefined,
      title: v.title,
      price: parseFloat(v.price),
      compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : undefined,
      inventory: v.inventory_quantity,
      options: buildOptions(v),
    })),
  };
}

function buildOptions(v: ShopifyVariant): Record<string, string> | undefined {
  const opts: Record<string, string> = {};
  if (v.option1 && v.option1 !== "Default Title") opts["option1"] = v.option1;
  if (v.option2) opts["option2"] = v.option2;
  if (v.option3) opts["option3"] = v.option3;
  return Object.keys(opts).length ? opts : undefined;
}

function mapShopifyOrder(o: ShopifyOrder): ExternalOrder {
  return {
    externalId: String(o.id),
    orderNumber: o.name,
    createdAt: o.created_at,
    status: o.fulfillment_status ?? o.financial_status,
    customerPhone: o.customer?.phone ?? o.shipping_address?.phone,
    customerName: o.customer
      ? `${o.customer.first_name ?? ""} ${o.customer.last_name ?? ""}`.trim()
      : o.shipping_address?.name,
    shippingAddress: o.shipping_address
      ? {
          name: o.shipping_address.name,
          phone: o.shipping_address.phone,
          line1: o.shipping_address.address1,
          city: o.shipping_address.city,
        }
      : undefined,
    totalAmount: parseFloat(o.total_price),
    paymentMethod: o.gateway,
    lineItems: o.line_items.map((li) => ({
      externalProductId: String(li.product_id),
      externalVariantId: String(li.variant_id),
      title: li.title,
      qty: li.quantity,
      unitPrice: parseFloat(li.price),
    })),
  };
}
