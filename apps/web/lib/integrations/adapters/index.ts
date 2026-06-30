import type { PlatformAdapter, PlatformCredentials } from "../types";
import { ShopifyAdapter } from "./shopify";
import { WooCommerceAdapter } from "./woocommerce";
import { CustomApiAdapter } from "./customApi";

export function getAdapter(creds: PlatformCredentials): PlatformAdapter {
  switch (creds.platform) {
    case "shopify":
      return new ShopifyAdapter(creds);
    case "woocommerce":
      return new WooCommerceAdapter(creds);
    case "custom_api":
      return new CustomApiAdapter(creds);
    case "webhook_only":
      return {
        testConnection: async () => { /* webhook_only has no outbound API */ },
        fetchProducts: async () => [],
        fetchOrders: async () => [],
        updateInventory: async () => {},
      };
  }
}
