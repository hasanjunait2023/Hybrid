// Constrained theme-customizer settings model (Phase 2, brief §2.2/2.3; DESIGN §Q1).
//
// This Zod schema is THE contract for everything a seller may customize. It maps
// 1:1 to the four control groups (colors / typography / content / sections) and
// is deliberately CLOSED: no free-form HTML, no arbitrary fonts, no arbitrary
// section types, no per-element positioning. Any drift toward a page builder
// (drag canvas, custom CSS, image-anywhere) is Phase 4 and is refused here by
// construction — the enums and `.strict()` objects make invalid input fail Zod
// before any DB write.
//
// Persisted as JSON in tenant_theme_settings.settings (one is_active=true
// "published" row read by the storefront, one is_active=false "draft" row the
// customizer edits live). Validated in the Server Action before the write, so a
// malformed or hostile payload (e.g. a `javascript:` logo URL, a #fff injection
// attempt) can never reach the column or the rendered <style>/<img>.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Allowlists — the closed sets the customizer may pick from.
// ---------------------------------------------------------------------------

// Pre-approved, self-hosted Bangla/Latin font families (DESIGN §Q1.3 "ফন্ট").
// No upload, no URL — the enum IS the allowlist. Hind Siliguri is the default
// (the only one the storefront ships subset today; the others are name-level
// choices the render layer maps to a stack).
export const FONT_CHOICES = [
  "Hind Siliguri",
  "Noto Sans Bengali",
  "Baloo Da 2",
  "Anek Bangla",
] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

// The FIXED set of home sections (DESIGN §Q1.3 "সেকশন"). Sellers may toggle and
// reorder these via up/down buttons (<SectionToggleRow>) — they may NOT add,
// duplicate, nest, or invent section types. The literal union is the guard.
export const SECTION_TYPES = [
  "announcement_bar",
  "hero",
  "featured_products",
  "collections_grid",
  "trust_band",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

// A 6-digit hex color (#RRGGBB), case-insensitive. Restricting the SHAPE here is
// the XSS guard for colors: the value is interpolated into an inline CSS custom
// property on the storefront, so anything other than a literal hex (e.g.
// "red;}body{background:url(javascript:…)") must be rejected before render.
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "রঙটি #RRGGBB ফরম্যাটে দিন।");

// Seller-controlled URLs that end up as href/src on the public storefront
// (logo, hero image). Empty allowed; otherwise must parse to http(s) — the same
// trust-boundary check settings/store/actions.ts uses, mirrored by safeUrl() at
// render time (defense in depth).
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || isHttpUrl(u), {
    message: "সঠিক ওয়েব ঠিকানা দিন (http বা https দিয়ে শুরু)।",
  });

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const ColorsSchema = z
  .object({
    primary: hexColor,
    accent: hexColor,
    background: hexColor,
    surface: hexColor,
    text: hexColor,
  })
  .strict();
export type ThemeColors = z.infer<typeof ColorsSchema>;

export const TypographySchema = z
  .object({
    headingFont: z.enum(FONT_CHOICES),
    bodyFont: z.enum(FONT_CHOICES),
  })
  .strict();
export type ThemeTypography = z.infer<typeof TypographySchema>;

export const ContentSchema = z
  .object({
    // The store name is sourced from the tenant/store record; a theme preset
    // legitimately ships none. Optional here (empty → storefront falls back to
    // the tenant's name in storefront/data.ts). Other validation stays strict.
    storeName: z.string().trim().max(120).default(""),
    logoUrl: httpUrl.default(""),
    heroHeadline: z.string().trim().max(120).default(""),
    heroSubline: z.string().trim().max(200).default(""),
    heroCta: z.string().trim().max(40).default(""),
    heroImageUrl: httpUrl.default(""),
    // Single featured collection (id) or null. The id is validated for shape
    // only here; existence/ownership is enforced by RLS at read time.
    featuredCollectionId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type ThemeContent = z.infer<typeof ContentSchema>;

export const SectionSchema = z
  .object({
    type: z.enum(SECTION_TYPES),
    enabled: z.boolean(),
    position: z.number().int().min(0).max(SECTION_TYPES.length - 1),
  })
  .strict();
export type ThemeSection = z.infer<typeof SectionSchema>;

// The sections array must be EXACTLY the fixed set — no missing, no extra, no
// duplicate types. This is the structural lock that keeps "sections" a reorder
// of a known list, not a free composition.
const SectionsSchema = z
  .array(SectionSchema)
  .length(SECTION_TYPES.length)
  .refine(
    (arr) => {
      const types = new Set(arr.map((s) => s.type));
      return (
        types.size === SECTION_TYPES.length &&
        SECTION_TYPES.every((t) => types.has(t))
      );
    },
    { message: "সেকশনের তালিকা সম্পূর্ণ ও অপরিবর্তনীয় হতে হবে।" },
  );

// ---------------------------------------------------------------------------
// The top-level settings object — persisted verbatim to the JSON column.
// ---------------------------------------------------------------------------
export const ThemeSettingsSchema = z
  .object({
    // Which starter theme (component tree / preset) this tenant is on. The enum
    // is the catalog; activating a theme rewrites defaults for the other keys.
    themeCode: z.string().min(1).max(40),
    colors: ColorsSchema,
    typography: TypographySchema,
    content: ContentSchema,
    sections: SectionsSchema,
  })
  .strict();
export type ThemeSettings = z.infer<typeof ThemeSettingsSchema>;

export interface ThemeValidationResult {
  ok: boolean;
  data?: ThemeSettings;
  /** First Bengali error message, suitable for an inline danger strip. */
  error?: string;
}

// Parse-or-explain. Returns a single Bengali message (the first issue) so the
// Server Action can surface it without leaking the raw Zod tree to the client.
export function validateThemeSettings(input: unknown): ThemeValidationResult {
  const parsed = ThemeSettingsSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  return { ok: false, error: first?.message ?? "থিম সেটিংস সঠিক নয়।" };
}

// ---------------------------------------------------------------------------
// Contrast helper (DESIGN §Q1.3 — warn if text-on-background fails AA). Pure;
// used by the customizer UI for a warning chip and re-usable in tests.
// ---------------------------------------------------------------------------
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two #RRGGBB colors (1–21). */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA body text needs ≥ 4.5:1. */
export function passesAaContrast(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}
