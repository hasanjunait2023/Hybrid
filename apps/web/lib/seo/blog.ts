// Blog helpers — currently a no-op stub because Tier 6 P2 (Blog + Content Engine)
// is on the backlog. Once a `blog_posts` table exists (planned for
// 16_blog.sql migration), this returns real posts. For now, return [] so
// the sitemap build never breaks.

export type BlogPost = {
  slug: string;
  publishedAt: Date;
};

export async function getBlogPosts(): Promise<BlogPost[]> {
  // TODO(P2 backlog): wire to blog_posts table when introduced.
  return [];
}