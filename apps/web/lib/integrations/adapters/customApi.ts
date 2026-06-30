// Generic REST API adapter for custom storefronts.
// Supports bearer, basic, api_key, and none auth types.
// Pagination: page, cursor, or offset styles.
import type { PlatformAdapter, ExternalProduct, ExternalOrder, CustomApiCredentials } from "../types";

export class CustomApiAdapter implements PlatformAdapter {
  private readonly creds: CustomApiCredentials;
  private readonly base: string;

  constructor(creds: CustomApiCredentials) {
    this.creds = creds;
    this.base = creds.base_url.replace(/\/$/, "");
  }

  private authHeaders(): Record<string, string> {
    const { auth_type, token, username, password, api_key_header, api_key_value } = this.creds;
    if (auth_type === "bearer" && token) return { Authorization: `Bearer ${token}` };
    if (auth_type === "basic" && username && password) {
      return {
        Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      };
    }
    if (auth_type === "api_key" && api_key_header && api_key_value) {
      return { [api_key_header]: api_key_value };
    }
    return {};
  }

  private async req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Custom API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async testConnection(): Promise<void> {
    const path = this.creds.endpoints.products ?? "/";
    await this.req(path + "?limit=1");
  }

  async fetchProducts(): Promise<ExternalProduct[]> {
    const endpoint = this.creds.endpoints.products;
    if (!endpoint) return [];

    const pagination = this.creds.pagination ?? "page";
    const products: ExternalProduct[] = [];

    if (pagination === "page") {
      let page = 1;
      while (true) {
        const data = await this.req<unknown>(`${endpoint}?page=${page}&per_page=50`);
        const items = extractArray(data);
        if (!items.length) break;
        products.push(...items.map(mapGenericProduct));
        if (items.length < 50) break;
        page++;
      }
    } else if (pagination === "offset") {
      let offset = 0;
      while (true) {
        const data = await this.req<unknown>(`${endpoint}?offset=${offset}&limit=50`);
        const items = extractArray(data);
        if (!items.length) break;
        products.push(...items.map(mapGenericProduct));
        if (items.length < 50) break;
        offset += 50;
      }
    } else {
      // cursor — single page for now (custom API cursor schemas vary too widely)
      const data = await this.req<unknown>(`${endpoint}?limit=200`);
      products.push(...extractArray(data).map(mapGenericProduct));
    }

    return products;
  }

  async fetchOrders(since?: string): Promise<ExternalOrder[]> {
    const endpoint = this.creds.endpoints.orders;
    if (!endpoint) return [];

    let url = `${endpoint}?limit=100`;
    if (since) url += `&since=${encodeURIComponent(since)}`;

    const data = await this.req<unknown>(url);
    return extractArray(data).map(mapGenericOrder);
  }

  async updateInventory(externalVariantId: string, qty: number): Promise<void> {
    const endpoint = this.creds.endpoints.inventory;
    if (!endpoint) return;

    await this.req(`${endpoint}/${externalVariantId}`, "PUT", { quantity: qty, stock: qty });
  }
}

// ---------------------------------------------------------------------------
// Generic mappers — best-effort mapping from arbitrary API shapes.
// The adapter extracts well-known field names across common conventions.
// ---------------------------------------------------------------------------

function extractArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    // Common envelope keys
    for (const key of ["data", "products", "items", "results", "orders", "records"]) {
      if (Array.isArray(d[key])) return d[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function str(v: unknown): string {
  return v != null ? String(v) : "";
}

function num(v: unknown): number {
  const n = parseFloat(str(v));
  return isNaN(n) ? 0 : n;
}

function mapGenericProduct(p: Record<string, unknown>): ExternalProduct {
  const id = str(p.id ?? p.product_id ?? p.sku);
  const title = str(p.title ?? p.name ?? p.product_name ?? id);
  const description = str(p.description ?? p.body ?? p.content ?? "")
    .replace(/<[^>]*>/g, " ")
    .trim();

  const rawImages = p.images ?? p.image ?? p.photo ?? p.photos ?? p.thumbnail;
  const images: string[] = Array.isArray(rawImages)
    ? rawImages.map((i: unknown) =>
        typeof i === "string" ? i : str((i as Record<string, unknown>)?.src ?? (i as Record<string, unknown>)?.url),
      ).filter(Boolean)
    : rawImages
    ? [str(rawImages)]
    : [];

  const status =
    str(p.status ?? p.published ?? p.active) === "active" ||
    p.status === true ||
    p.published === true
      ? "active"
      : "draft";

  const rawTags = p.tags ?? p.categories;
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.map((t: unknown) => (typeof t === "string" ? t : str((t as Record<string, unknown>)?.name))).filter(Boolean)
    : rawTags
    ? [str(rawTags)]
    : [];

  return {
    externalId: id,
    title,
    description,
    images,
    status,
    tags,
    variants: [
      {
        externalId: str(p.variant_id ?? p.id ?? id),
        sku: str(p.sku ?? p.barcode ?? "") || undefined,
        title: "Default",
        price: num(p.price ?? p.sale_price ?? p.selling_price ?? 0),
        compareAtPrice: p.compare_at_price != null ? num(p.compare_at_price) : undefined,
        inventory: Math.floor(num(p.stock ?? p.stock_quantity ?? p.inventory ?? 0)),
      },
    ],
  };
}

function mapGenericOrder(o: Record<string, unknown>): ExternalOrder {
  const id = str(o.id ?? o.order_id);
  const billing = (o.billing ?? o.customer ?? {}) as Record<string, unknown>;
  const shipping = (o.shipping ?? o.shipping_address ?? {}) as Record<string, unknown>;

  const rawItems = o.line_items ?? o.items ?? o.products ?? [];
  const lineItems = Array.isArray(rawItems)
    ? (rawItems as Record<string, unknown>[]).map((li) => ({
        externalProductId: str(li.product_id ?? li.id),
        externalVariantId: li.variant_id ? str(li.variant_id) : undefined,
        title: str(li.title ?? li.name),
        qty: Math.floor(num(li.quantity ?? li.qty ?? 1)),
        unitPrice: num(li.price ?? li.unit_price ?? 0),
      }))
    : [];

  return {
    externalId: id,
    orderNumber: str(o.number ?? o.order_number ?? o.reference ?? id),
    createdAt: str(o.created_at ?? o.date_created ?? o.date ?? new Date().toISOString()),
    status: str(o.status ?? o.fulfillment_status ?? "pending"),
    customerPhone:
      str(billing.phone ?? billing.mobile ?? shipping.phone ?? o.phone ?? "") || undefined,
    customerName:
      str(billing.name ?? `${billing.first_name ?? ""} ${billing.last_name ?? ""}`.trim() ?? o.customer_name ?? "") ||
      undefined,
    shippingAddress:
      shipping.address_1 ?? shipping.address ?? shipping.line1
        ? {
            name: str(shipping.name ?? `${shipping.first_name ?? ""} ${shipping.last_name ?? ""}`.trim()),
            phone: str(shipping.phone ?? ""),
            line1: str(shipping.address_1 ?? shipping.address ?? shipping.line1 ?? ""),
            city: str(shipping.city ?? ""),
          }
        : undefined,
    totalAmount: num(o.total ?? o.total_price ?? o.amount ?? 0),
    paymentMethod: str(o.payment_method ?? o.gateway ?? o.payment_type ?? ""),
    lineItems,
  };
}
