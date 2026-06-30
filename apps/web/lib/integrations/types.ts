// External platform integration — TypeScript types.
// Mirrors the DB schema in 28_integrations.sql.

// ---------------------------------------------------------------------------
// Platform credentials (sealed with APP_ENCRYPTION_KEY before DB write)
// ---------------------------------------------------------------------------

export interface ShopifyCredentials {
  platform: "shopify";
  shop_url: string;           // e.g. "mystore.myshopify.com"
  access_token: string;       // Admin API access token
}

export interface WooCommerceCredentials {
  platform: "woocommerce";
  site_url: string;           // e.g. "https://mystore.com"
  consumer_key: string;       // ck_...
  consumer_secret: string;    // cs_...
}

export interface CustomApiCredentials {
  platform: "custom_api";
  base_url: string;
  auth_type: "bearer" | "basic" | "api_key" | "none";
  token?: string;
  username?: string;          // basic auth
  password?: string;          // basic auth
  api_key_header?: string;    // header name for api_key auth
  api_key_value?: string;
  endpoints: {
    products?: string;        // relative path, e.g. "/api/products"
    inventory?: string;
    orders?: string;
  };
  // Pagination style: "page" (page=1&per_page=50) or "cursor" or "offset"
  pagination?: "page" | "cursor" | "offset";
}

export interface WebhookOnlyCredentials {
  platform: "webhook_only";
  incoming_secret?: string;   // HMAC secret for verifying inbound events
}

export type PlatformCredentials =
  | ShopifyCredentials
  | WooCommerceCredentials
  | CustomApiCredentials
  | WebhookOnlyCredentials;

// ---------------------------------------------------------------------------
// Sync configuration (stored as jsonb, not encrypted)
// ---------------------------------------------------------------------------

export type SyncDirection = "import" | "export" | "bidirectional";

export interface EntitySyncConfig {
  enabled: boolean;
  direction: SyncDirection;
}

export interface SyncConfig {
  entities: {
    product?: EntitySyncConfig;
    inventory?: EntitySyncConfig;
    order?: EntitySyncConfig;
    customer?: EntitySyncConfig;
  };
  auto_sync: boolean;
  sync_interval_minutes: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  entities: {
    product:   { enabled: true,  direction: "import" },
    inventory: { enabled: true,  direction: "bidirectional" },
    order:     { enabled: false, direction: "export" },
    customer:  { enabled: false, direction: "import" },
  },
  auto_sync: true,
  sync_interval_minutes: 60,
};

// ---------------------------------------------------------------------------
// Integration row (as returned from DB)
// ---------------------------------------------------------------------------

export type IntegrationPlatform = "shopify" | "woocommerce" | "custom_api" | "webhook_only";
export type IntegrationStatus = "pending" | "active" | "paused" | "error";

export interface Integration {
  id: string;
  tenantId: string;
  platform: IntegrationPlatform;
  displayName: string;
  status: IntegrationStatus;
  /** Credentials are sealed strings from DB; decrypted only in server context. */
  credentialsSealed: string | null;
  webhookToken: string;
  config: SyncConfig;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// External entity shapes (normalised — every adapter maps to these)
// ---------------------------------------------------------------------------

export interface ExternalProduct {
  externalId: string;
  title: string;
  description: string;
  images: string[];
  variants: ExternalVariant[];
  tags?: string[];
  category?: string;
  status: "active" | "draft" | "archived";
}

export interface ExternalVariant {
  externalId: string;
  sku?: string;
  title: string;
  price: number;            // in BDT or original currency
  compareAtPrice?: number;
  inventory: number;
  options?: Record<string, string>; // e.g. { size: "L", color: "Red" }
  imageUrl?: string;
}

export interface ExternalOrder {
  externalId: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  customerPhone?: string;
  customerName?: string;
  lineItems: ExternalOrderItem[];
  shippingAddress?: ExternalAddress;
  totalAmount: number;
  paymentMethod?: string;
}

export interface ExternalOrderItem {
  externalProductId: string;
  externalVariantId?: string;
  title: string;
  qty: number;
  unitPrice: number;
}

export interface ExternalAddress {
  name?: string;
  phone?: string;
  line1?: string;
  city?: string;
  district?: string;
}

// ---------------------------------------------------------------------------
// Platform adapter interface — every adapter must implement this
// ---------------------------------------------------------------------------

export interface PlatformAdapter {
  /** Verify credentials are valid; throws if not. */
  testConnection(): Promise<void>;

  /** Fetch all products. Returns normalised ExternalProduct[]. */
  fetchProducts(): Promise<ExternalProduct[]>;

  /** Fetch orders placed after `since` (ISO string). */
  fetchOrders(since?: string): Promise<ExternalOrder[]>;

  /** Update stock level for a variant identified by its external ID. */
  updateInventory(externalVariantId: string, qty: number): Promise<void>;

  /** Register an outbound webhook on the external platform. */
  registerWebhook?(endpoint: string, topic: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Sync log row
// ---------------------------------------------------------------------------

export type SyncEntityType = "product" | "variant" | "inventory" | "order" | "customer";
export type SyncTrigger = "manual" | "webhook" | "scheduled";
export type SyncStatusType = "running" | "success" | "partial" | "error";

export interface SyncLogRow {
  id: string;
  integrationId: string;
  entityType: SyncEntityType;
  direction: SyncDirection;
  trigger: SyncTrigger;
  status: SyncStatusType;
  itemsSynced: number;
  itemsFailed: number;
  errorDetail: string | null;
  startedAt: string;
  finishedAt: string | null;
}
