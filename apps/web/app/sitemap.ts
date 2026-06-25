import type { MetadataRoute } from "next";
import { getActiveTenants } from "@/lib/seo/tenants";
import { getBlogPosts } from "@/lib/seo/blog";

// Hybrid sitemap — covers public marketing pages + every active tenant's
// storefront so search engines can crawl them. Tenant URLs live on the
// `*.hybrid.ecomex.cloud` wildcard subdomain.
//
// NOTE: dynamic tenant discovery goes through @hybrid/db with the platform
// admin role — the sitemap runs at build/edge, so we can't use withTenant()
// (per-tenant). asPlatformAdmin is the documented escape hatch for cross-
// tenant reads.

const BASE_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://hybrid.ecomex.cloud";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // 1. Top-level marketing pages (EN + BN)
  const marketingPages = [
    { path: "", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/features", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/contact", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/refund", priority: 0.3, changeFrequency: "yearly" as const },
  ];

  const locales = ["en", "bn"];
  const marketingEntries: MetadataRoute.Sitemap = marketingPages.flatMap((p) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${p.path}`.replace(/\/$/, "") || `${BASE_URL}/${locale}`,
      lastModified: now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}${p.path}`.replace(/\/$/, "") || `${BASE_URL}/${l}`]),
        ),
      },
    })),
  );

  // 2. Active tenant storefronts
  let tenantEntries: MetadataRoute.Sitemap = [];
  try {
    const tenants = await getActiveTenants();
    tenantEntries = tenants.map((t) => ({
      url: `https://${t.subdomain}.hybrid.ecomex.cloud`,
      lastModified: t.updatedAt ?? now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch (err) {
    // Sitemap must never break the build — log and continue with marketing pages only.
    console.error("[sitemap] tenant fetch failed:", err);
  }

  // 3. Blog posts (P2 backlog — currently empty)
  let blogEntries: MetadataRoute.Sitemap = [];
  try {
    const posts = await getBlogPosts();
    blogEntries = posts.map((p) => ({
      url: `${BASE_URL}/blog/${p.slug}`,
      lastModified: p.publishedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  } catch {
    /* no blog yet */
  }

  return [...marketingEntries, ...tenantEntries, ...blogEntries];
}