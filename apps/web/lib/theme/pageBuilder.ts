// OS 2.0 Page Builder — data types, Zod validation, and DB helpers.
//
// Persists the home page composition in store_page (type='home') as a `blocks`
// jsonb array. Each block is a fully self-contained section with its own id,
// type, and per-type settings. Unlike the constrained Phase 2 customizer (fixed
// section set, toggle/reorder only), the page builder is OPEN: sellers can add,
// remove, duplicate, and freely order any section type any number of times.
//
// Security: every write goes through this module's validateBlocks() before any
// DB call. The settings sub-schemas reject javascript: URLs, over-long strings,
// and unexpected keys. The storefront renderer uses only the validated types.

import { z } from "zod";
import { withTenant } from "@hybrid/db";

// ---------------------------------------------------------------------------
// URL helper
// ---------------------------------------------------------------------------

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || isHttpUrl(u), {
    message: "সঠিক ওয়েব ঠিকানা দিন (http বা https দিয়ে শুরু)।",
  });

function isHttpUrl(v: string): boolean {
  try {
    const p = new URL(v);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-type settings schemas
// ---------------------------------------------------------------------------

const HeroSettings = z.object({
  headline: z.string().trim().max(120).default(""),
  subline: z.string().trim().max(200).default(""),
  cta_text: z.string().trim().max(60).default(""),
  cta_url: httpUrl.default(""),
  image_url: httpUrl.default(""),
});

const AnnouncementSettings = z.object({
  text: z.string().trim().max(200).default(""),
});

const FeaturedProductsSettings = z.object({
  heading: z.string().trim().max(120).default(""),
  product_count: z.number().int().min(2).max(24).default(8),
});

const CollectionsGridSettings = z.object({
  heading: z.string().trim().max(120).default(""),
});

const TrustBandSettings = z.object({});

const ImageTextSettings = z.object({
  heading: z.string().trim().max(120).default(""),
  body: z.string().trim().max(600).default(""),
  image_url: httpUrl.default(""),
  image_side: z.enum(["left", "right"]).default("left"),
  cta_text: z.string().trim().max(60).default(""),
  cta_url: httpUrl.default(""),
});

const RichTextSettings = z.object({
  // Plain text only (no HTML) — XSS guard by construction.
  content: z.string().trim().max(2000).default(""),
});

const CtaBannerSettings = z.object({
  heading: z.string().trim().max(120).default(""),
  button_text: z.string().trim().max(60).default(""),
  button_url: httpUrl.default(""),
});

const SpacerSettings = z.object({
  height_rem: z.number().min(1).max(20).default(4),
});

// ---------------------------------------------------------------------------
// Discriminated-union block schema
// ---------------------------------------------------------------------------

const BlockBase = z.object({
  id: z.string().uuid("ব্লক আইডি অবৈধ।"),
});

export const PageBlockSchema = z.discriminatedUnion("type", [
  BlockBase.extend({ type: z.literal("hero"), settings: HeroSettings }),
  BlockBase.extend({ type: z.literal("announcement_bar"), settings: AnnouncementSettings }),
  BlockBase.extend({ type: z.literal("featured_products"), settings: FeaturedProductsSettings }),
  BlockBase.extend({ type: z.literal("collections_grid"), settings: CollectionsGridSettings }),
  BlockBase.extend({ type: z.literal("trust_band"), settings: TrustBandSettings }),
  BlockBase.extend({ type: z.literal("image_text"), settings: ImageTextSettings }),
  BlockBase.extend({ type: z.literal("rich_text"), settings: RichTextSettings }),
  BlockBase.extend({ type: z.literal("cta_banner"), settings: CtaBannerSettings }),
  BlockBase.extend({ type: z.literal("spacer"), settings: SpacerSettings }),
]);

export type PageBlock = z.infer<typeof PageBlockSchema>;
export type PageBlockType = PageBlock["type"];

export const HomePageBlocksSchema = z.array(PageBlockSchema).max(30, "সর্বাধিক ৩০টি ব্লক।");

export type HomePageBlocks = z.infer<typeof HomePageBlocksSchema>;

// ---------------------------------------------------------------------------
// Block type metadata (for the add-section palette)
// ---------------------------------------------------------------------------

export interface BlockMeta {
  type: PageBlockType;
  label: string;
  description: string;
  icon: string;
}

export const BLOCK_CATALOG: BlockMeta[] = [
  { type: "hero",              label: "হিরো",              description: "বড় শিরোনাম, ছবি ও কল-টু-অ্যাকশন",       icon: "▦" },
  { type: "announcement_bar", label: "ঘোষণা বার",         description: "পেজের শীর্ষে একটি নোটিশ",               icon: "📢" },
  { type: "featured_products",label: "পণ্য গ্রিড",         description: "স্টোরের পণ্য তালিকা",                   icon: "🛍" },
  { type: "collections_grid", label: "কালেকশন গ্রিড",     description: "কালেকশন টাইলস",                         icon: "📦" },
  { type: "trust_band",       label: "ট্রাস্ট ব্যান্ড",   description: "বিশ্বাসযোগ্যতার চিহ্ন",                icon: "✅" },
  { type: "image_text",       label: "ছবি + লেখা",        description: "পাশাপাশি ছবি ও টেক্সট",                 icon: "🖼" },
  { type: "rich_text",        label: "টেক্সট ব্লক",       description: "একটি টেক্সট অনুচ্ছেদ",                  icon: "¶" },
  { type: "cta_banner",       label: "CTA ব্যানার",       description: "ফুল-উইডথ কল-টু-অ্যাকশন",               icon: "🎯" },
  { type: "spacer",           label: "স্পেসার",           description: "উল্লম্ব খালি জায়গা",                    icon: "⬛" },
];

// ---------------------------------------------------------------------------
// Default settings per type
// ---------------------------------------------------------------------------

export function defaultSettings(type: PageBlockType): PageBlock["settings"] {
  switch (type) {
    case "hero":              return HeroSettings.parse({});
    case "announcement_bar": return AnnouncementSettings.parse({});
    case "featured_products":return FeaturedProductsSettings.parse({});
    case "collections_grid": return CollectionsGridSettings.parse({});
    case "trust_band":       return TrustBandSettings.parse({});
    case "image_text":       return ImageTextSettings.parse({});
    case "rich_text":        return RichTextSettings.parse({});
    case "cta_banner":       return CtaBannerSettings.parse({});
    case "spacer":           return SpacerSettings.parse({});
  }
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

export function validateBlocks(raw: unknown): { ok: true; data: HomePageBlocks } | { ok: false; error: string } {
  const result = HomePageBlocksSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const msg = result.error.issues.map((i) => i.message).join("; ");
  return { ok: false, error: msg };
}

// ---------------------------------------------------------------------------
// DB helpers (all via withTenant — RLS enforced)
// ---------------------------------------------------------------------------

export interface HomePageData {
  id: string;
  blocks: HomePageBlocks;
  publishedAt: string | null;
}

const HOME_SLUG = "__home__";

export async function getHomePageBlocks(
  tenantId: string,
  userId: string | null,
): Promise<HomePageData | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string; blocks: unknown; updated_at: string }[]>`
      select id, blocks, updated_at
      from store_page
      where tenant_id = ${tenantId}
        and type = 'home'
        and slug = ${HOME_SLUG}
      limit 1
    `,
  );
  if (!rows[0]) return null;
  const raw = rows[0];
  const check = validateBlocks(raw.blocks);
  if (!check.ok) return null;
  return { id: raw.id, blocks: check.data, publishedAt: raw.updated_at };
}

export async function saveHomePageBlocks(
  tenantId: string,
  userId: string,
  blocks: HomePageBlocks,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      insert into store_page (tenant_id, type, slug, title, blocks, status)
      values (
        ${tenantId},
        'home',
        ${HOME_SLUG},
        'Home',
        ${JSON.stringify(blocks)}::jsonb,
        'published'
      )
      on conflict (tenant_id, slug)
      do update set
        blocks = excluded.blocks,
        status = 'published',
        updated_at = now()
    `;
  });
}

// Public read — no userId (storefront path, RLS allows tenant_id match).
export async function getPublicHomePageBlocks(
  tenantId: string,
): Promise<HomePageBlocks | null> {
  const rows = await withTenant(tenantId, null, (tx) =>
    tx<{ blocks: unknown }[]>`
      select blocks
      from store_page
      where tenant_id = ${tenantId}
        and type = 'home'
        and slug = ${HOME_SLUG}
        and status = 'published'
      limit 1
    `,
  );
  if (!rows[0]) return null;
  const check = validateBlocks(rows[0].blocks);
  return check.ok ? check.data : null;
}
