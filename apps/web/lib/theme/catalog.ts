// Theme catalog — the 3 starter themes (DESIGN §Q2, brief §2.2): Doreja (general),
// Megh (fashion/editorial), Bazar (electronics/dense).
//
// Why a code-level catalog and not 3 DB `theme` rows: the migration/seed SQL is
// owned by another slice this wave (we must NOT add a migration or edit
// 03_seed.sql). So the catalog lives in code keyed by `themeCode`, and every
// tenant_theme_settings row references the single shipped `theme` row while
// storing its chosen `themeCode` + full settings in the JSON column. The themes
// are genuinely distinct: each ships its own default palette, font pairing, and
// section ORDER/visibility — and the storefront renderer (storefront/data.ts)
// branches layout on `themeCode`, so they differ structurally, not just by color
// (DESIGN §Q2: "a real component tree, not a recolor").
import {
  FONT_CHOICES,
  SECTION_TYPES,
  type FontChoice,
  type SectionType,
  type ThemeSettings,
} from "./schema";

export interface ThemeCatalogEntry {
  code: string;
  name: string;
  /** One-line Bangla descriptor (DESIGN §Q2 card). */
  descriptor: string;
  category: "general" | "fashion" | "electronics";
  /** Defaults applied when a tenant activates this theme. */
  defaults: ThemeSettings;
}

// Helper: build the fixed sections array in a given visible order. Any section
// not listed is appended (disabled) so the array always has the full fixed set
// (the schema requires exactly SECTION_TYPES.length entries).
function sections(
  order: SectionType[],
  disabled: SectionType[] = [],
): ThemeSettings["sections"] {
  const seen = new Set<SectionType>();
  const out: ThemeSettings["sections"] = [];
  order.forEach((type, i) => {
    seen.add(type);
    out.push({ type, enabled: !disabled.includes(type), position: i });
  });
  // Append any remaining fixed sections (disabled) to keep the set complete.
  let pos = order.length;
  for (const type of SECTION_TYPES) {
    if (!seen.has(type)) {
      out.push({ type, enabled: false, position: pos });
      pos += 1;
    }
  }
  return out;
}

const HIND: FontChoice = FONT_CHOICES[0]; // Hind Siliguri

export const THEME_CATALOG: ThemeCatalogEntry[] = [
  {
    code: "doreja",
    name: "Doreja",
    descriptor: "সাধারণ দোকানের জন্য উষ্ণ, নির্ভরযোগ্য ডিফল্ট থিম।",
    category: "general",
    defaults: {
      themeCode: "doreja",
      colors: {
        primary: "#1D4ED8",
        accent: "#F59E0B",
        background: "#FBFAF8",
        surface: "#FFFFFF",
        text: "#1C1917",
      },
      typography: { headingFont: HIND, bodyFont: HIND },
      content: {
        storeName: "",
        logoUrl: "",
        heroHeadline: "",
        heroSubline: "",
        heroCta: "",
        heroImageUrl: "",
        featuredCollectionId: null,
      },
      // Doreja: announcement off, hero → featured products → trust band.
      sections: sections(
        ["hero", "featured_products", "trust_band", "collections_grid"],
        ["collections_grid"],
      ),
    },
  },
  {
    code: "megh",
    name: "Megh",
    descriptor: "ফ্যাশন ও লাইফস্টাইলের জন্য এডিটোরিয়াল, ছবি-কেন্দ্রিক থিম।",
    category: "fashion",
    defaults: {
      themeCode: "megh",
      colors: {
        primary: "#7C3AED",
        accent: "#EC4899",
        background: "#FFFFFF",
        surface: "#FAF5FF",
        text: "#1F1B2E",
      },
      typography: { headingFont: FONT_CHOICES[3], bodyFont: HIND }, // Anek heading
      content: {
        storeName: "",
        logoUrl: "",
        heroHeadline: "",
        heroSubline: "",
        heroCta: "",
        heroImageUrl: "",
        featuredCollectionId: null,
      },
      // Megh leads with collections (lookbook feel), big hero, announcement on.
      sections: sections([
        "announcement_bar",
        "hero",
        "collections_grid",
        "featured_products",
        "trust_band",
      ]),
    },
  },
  {
    code: "bazar",
    name: "Bazar",
    descriptor: "ইলেকট্রনিক্স ও বহু-পণ্যের জন্য ঘন, তালিকা-কেন্দ্রিক থিম।",
    category: "electronics",
    defaults: {
      themeCode: "bazar",
      colors: {
        primary: "#047857",
        accent: "#F59E0B",
        background: "#F8FAFC",
        surface: "#FFFFFF",
        text: "#0F172A",
      },
      typography: { headingFont: FONT_CHOICES[2], bodyFont: HIND }, // Baloo heading
      content: {
        storeName: "",
        logoUrl: "",
        heroHeadline: "",
        heroSubline: "",
        heroCta: "",
        heroImageUrl: "",
        featuredCollectionId: null,
      },
      // Bazar is product-dense: announcement + slim hero, then a big grid first.
      sections: sections([
        "announcement_bar",
        "hero",
        "featured_products",
        "collections_grid",
        "trust_band",
      ]),
    },
  },
];

export function getThemeEntry(code: string): ThemeCatalogEntry | undefined {
  return THEME_CATALOG.find((t) => t.code === code);
}

export const DEFAULT_THEME_CODE = "doreja";

/**
 * Defaults for a theme code, falling back to Doreja for an unknown code.
 * Returns a deep clone so callers can freely spread/mutate the result without
 * poisoning the shared in-memory catalog (the nested colors/content/sections
 * objects are otherwise live references to the single THEME_CATALOG entry).
 */
export function themeDefaults(code: string): ThemeSettings {
  const entry = getThemeEntry(code) ?? THEME_CATALOG[0]!;
  return structuredClone(entry.defaults);
}
