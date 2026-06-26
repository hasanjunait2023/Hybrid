import type { MetadataRoute } from "next";

// PWA manifest. Drives "Add to Home Screen" install on Android/Chrome and
// the install banner on desktop. Tenant subdomains install their OWN
// manifest dynamically later (P2) — this one is for the marketing surface
// + admin panel only.
//
// Relative URLs throughout (`start_url: "/"`, `scope: "/"`). The service
// worker is registered with scope "/" so this manifest applies to both
// the marketing root and any tenant subdomain that proxies here.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hybrid — Multi-tenant commerce for Bangladesh",
    short_name: "Hybrid",
    description:
      "Hybrid lets Bangladeshi merchants launch their own branded online store in minutes. Bengali-first, bKash/Nagad ready, mobile-optimized.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a0a0b",
    theme_color: "#7c3aed",
    lang: "en",
    categories: ["business", "shopping", "productivity"],
    icons: [
      { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/marketing/hero-mobile.png",
        sizes: "1170x2532",
        type: "image/png",
        form_factor: "narrow",
      },
    ],
    shortcuts: [
      {
        name: "My Store",
        short_name: "Store",
        url: "/admin",
        description: "Open your store admin panel",
      },
      {
        name: "New Order",
        short_name: "Order",
        url: "/admin/orders/new",
        description: "Create a new order",
      },
    ],
    prefer_related_applications: false,
  };
}