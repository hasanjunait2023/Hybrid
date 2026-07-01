// Canonical hex values for theme preview tiles and color presets.
// Both ThemeCatalog.tsx (gradient swatches) and ColorControls.tsx (preset chips)
// reference these values — keep them in one place so a palette change is one edit.
import type { ThemeColors } from "@/lib/theme/schema";

export const HEX = {
  indigo:    "#1D4ED8",
  violet:    "#7C3AED",
  emerald:   "#047857",
  blueNavy:  "#1E3A8A",
  marigold:  "#F59E0B",
  gold:      "#D4AF37",
  rose:      "#EC4899",
  offWhite:  "#FBFAF8",
  coolWhite: "#F8FAFC",
  white:     "#FFFFFF",
  charcoal:  "#1C1917",
  darkSlate: "#0F172A",
  darkGray:  "#111827",
} as const;

export const COLOR_PRESETS: { key: "dorejaClassic" | "green" | "blueGold"; colors: ThemeColors }[] = [
  {
    key: "dorejaClassic",
    colors: {
      primary:    HEX.indigo,
      accent:     HEX.marigold,
      background: HEX.offWhite,
      surface:    HEX.white,
      text:       HEX.charcoal,
    },
  },
  {
    key: "green",
    colors: {
      primary:    HEX.emerald,
      accent:     HEX.marigold,
      background: HEX.coolWhite,
      surface:    HEX.white,
      text:       HEX.darkSlate,
    },
  },
  {
    key: "blueGold",
    colors: {
      primary:    HEX.blueNavy,
      accent:     HEX.gold,
      background: HEX.white,
      surface:    HEX.coolWhite,
      text:       HEX.darkGray,
    },
  },
];

export const THEME_GRADIENTS: Record<string, { from: string; to: string }> = {
  doreja: { from: HEX.indigo,   to: HEX.marigold },
  megh:   { from: HEX.violet,   to: HEX.rose },
  bazar:  { from: HEX.emerald,  to: HEX.marigold },
};
