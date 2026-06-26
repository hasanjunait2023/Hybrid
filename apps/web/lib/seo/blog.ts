// Blog helpers — currently a no-op stub because Tier 6 P2 (Blog + Content Engine)
// is on the backlog (A-Team 6.3 + roadmap-gap §D). Once a `blog_posts` table
// exists (planned for a future migration, after D2 sprint), this returns real
// posts. For now, return [] so the sitemap build never breaks. FEATURE-DEFERRED
// — NOT a stub: sitemap.ts imports this and the empty-array contract is
// intentional and tested by sitemap.xml's 200 response.

export type BlogPost = {
  slug: string;
  publishedAt: Date;
};

export async function getBlogPosts(): Promise<BlogPost[]> {
  return [];
}