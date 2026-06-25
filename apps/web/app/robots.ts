import type { MetadataRoute } from "next";

// robots.txt — allow all crawlers, point them at sitemap.xml, and explicitly
// disallow the platform admin area, API routes, and dev-login (those are
// either auth-gated or non-canonical surfaces).

const BASE_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://hybrid.ecomex.cloud";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin", // admin panel — auth-gated
          "/platform", // platform team console — auth-gated
          "/api/", // API routes — not user-facing
          "/dev-login", // local dev only
          "/store-not-found",
          "/login",
          "/signup",
        ],
      },
      // AI crawlers — explicitly allowed (Bangladesh merchants want their
      // storefronts indexed by ChatGPT/Perplexity for product discovery).
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}