// WooCommerce REST API v3 adapter.
// Normalises WooCommerce product/order responses to the platform-agnostic types.
import type { PlatformAdapter, ExternalProduct, ExternalOrder, WooCommerceCredentials } from "../types";

export class WooCommerceAdapter implements PlatformAdapter {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(creds: WooCommerceCredentials) {
    const base = creds.site_url.replace(/\/$/, "");
    this.baseUrl = `${base}/wp-json/wc/v3`;
    this.authHeader =
      "Basic " + Buffer.from(`${creds.consumer_key}:${creds.consumer_secret}`).toString("base64");
  }

  private async req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WooCommerce API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async testConnection(): Promise<void> {
    await this.req("/system_status");
  }

  async fetchProducts(): Promise<ExternalProduct[]> {
    const products: ExternalProduct[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
      const data = await this.req<WooProduct[]>(`/products?${params}`);
      if (!data.length) break;

      for (const p of data) {
        if (p.type === "variable") {
          const vars = await this.req<WooVariation[]>(`/products/${p.id}/variations?per_page=100`);
          products.push(mapWooProduct(p, vars));
        } else {
          products.push(mapWooProduct(p, []));
        }
      }

      if (data.length < perPage) break;
      page++;
    }

    return products;
  }

  async fetchOrders(since?: string): Promise<ExternalOrder[]> {
    const params = new URLSearchParams({ per_page: "100", status: "any" });
    if (since) params.set("after", since);

    const data = await this.req<WooOrder[]>(`/orders?${params}`);
    return data.map(mapWooOrder);
  }

  async updateInventory(externalVariantId: string, qty: number): Promise<void> {
    // externalVariantId may be "productId" or "productId:variationId"
    const [productId, variationId] = externalVariantId.split(":");
    if (variationId) {
      await this.req(`/products/${productId}/variations/${variationId}`, "PUT", {
        stock_quantity: qty,
        manage_stock: true,
      });
    } else {
      await this.req(`/products/${productId}`, "PUT", {
        stock_quantity: qty,
        manage_stock: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// WooCommerce response types (minimal)
// ---------------------------------------------------------------------------

interface WooImage {
  src: string;
}

interface WooCategory {
  name: string;
}

interface WooProduct {
  id: number;
  name: string;
  description: string;
  status: string;
  type: string;
  tags: { name: string }[];
  images: WooImage[];
  categories: WooCategory[];
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  attributes: { name: string; options: string[] }[];
}

interface WooVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  attributes: { name: string; option: string }[];
  image?: WooImage;
}

interface WooOrder {
  id: number;
  number: string;
  date_created: string;
  status: string;
  total: string;
  payment_method: string;
  billing: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address_1?: string;
    city?: string;
  };
  shipping: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address_1?: string;
    city?: string;
  };
  line_items: {
    product_id: number;
    variation_id: number;
    name: string;
    quantity: number;
    price: number;
  }[];
}

function mapWooProduct(p: WooProduct, variations: WooVariation[]): ExternalProduct {
  const status = p.status === "publish" ? "active" : p.status === "draft" ? "draft" : "archived";

  if (variations.length > 0) {
    return {
      externalId: String(p.id),
      title: p.name,
      description: p.description.replace(/<[^>]*>/g, " ").trim(),
      images: p.images.map((i) => i.src),
      status,
      tags: p.tags.map((t) => t.name),
      category: p.categories[0]?.name,
      variants: variations.map((v) => ({
        externalId: `${p.id}:${v.id}`,
        sku: v.sku || undefined,
        title: v.attributes.map((a) => a.option).join(" / ") || "Default",
        price: parseFloat(v.price || v.regular_price || "0"),
        compareAtPrice: v.regular_price && v.sale_price ? parseFloat(v.regular_price) : undefined,
        inventory: v.stock_quantity ?? 0,
        options: v.attributes.length
          ? Object.fromEntries(v.attributes.map((a) => [a.name, a.option]))
          : undefined,
        imageUrl: v.image?.src,
      })),
    };
  }

  return {
    externalId: String(p.id),
    title: p.name,
    description: p.description.replace(/<[^>]*>/g, " ").trim(),
    images: p.images.map((i) => i.src),
    status,
    tags: p.tags.map((t) => t.name),
    category: p.categories[0]?.name,
    variants: [
      {
        externalId: String(p.id),
        sku: p.sku || undefined,
        title: "Default",
        price: parseFloat(p.price || p.regular_price || "0"),
        compareAtPrice:
          p.regular_price && p.sale_price ? parseFloat(p.regular_price) : undefined,
        inventory: p.stock_quantity ?? 0,
      },
    ],
  };
}

function mapWooOrder(o: WooOrder): ExternalOrder {
  const billingName = [o.billing.first_name, o.billing.last_name].filter(Boolean).join(" ");
  const shippingName = [o.shipping.first_name, o.shipping.last_name].filter(Boolean).join(" ");

  return {
    externalId: String(o.id),
    orderNumber: o.number,
    createdAt: o.date_created,
    status: o.status,
    customerPhone: o.billing.phone || o.shipping.phone,
    customerName: billingName || shippingName,
    shippingAddress: o.shipping.address_1
      ? {
          name: shippingName,
          phone: o.shipping.phone,
          line1: o.shipping.address_1,
          city: o.shipping.city,
        }
      : undefined,
    totalAmount: parseFloat(o.total),
    paymentMethod: o.payment_method,
    lineItems: o.line_items.map((li) => ({
      externalProductId: String(li.product_id),
      externalVariantId: li.variation_id ? `${li.product_id}:${li.variation_id}` : String(li.product_id),
      title: li.name,
      qty: li.quantity,
      unitPrice: li.price,
    })),
  };
}
