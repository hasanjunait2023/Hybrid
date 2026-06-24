// Font loading (DESIGN §4.2). next/font self-hosts and subsets at build time
// (no Google Fonts hot-link / extra DNS on 3G) and emits a metric-aware fallback
// to keep CLS < 0.1. CSS variables feed --font-bangla / --font-mono / --font-latin
// in @hybrid/ui globals.css.
//
// DEVIATION FROM DESIGN: the design spec uses next/font/local with self-hosted
// HindSiliguri-*.woff2 files. Those binary assets are not in the repo, so we
// load Hind Siliguri + Noto Sans Bengali through next/font/google, which Next
// downloads, subsets, and self-hosts into the build output — same runtime
// result (no client hot-link). Drop the woff2 files into ./fonts and switch to
// localFont when they land; the variable names stay identical, so nothing else
// changes.
import {
  Hind_Siliguri,
  Noto_Sans_Bengali,
  IBM_Plex_Mono,
  Inter_Tight,
  Noto_Serif_Bengali,
  Fraunces,
  Poppins,
} from "next/font/google";

// Primary Bangla UI face. Weights 400/500/600/700 only (DESIGN §4.1).
export const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind-siliguri",
  display: "swap",
  preload: true,
  fallback: ["Noto Sans Bengali", "system-ui", "sans-serif"],
});

// Metric fallback so layout doesn't shift before Hind Siliguri paints.
export const notoSansBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "600"],
  variable: "--font-noto-bengali",
  display: "swap",
  preload: false,
});

// IDs / SKUs / amounts in admin (tabular).
export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  preload: false,
});

// Latin workhorse for the English toggle (DESIGN §4.5).
export const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
  preload: false,
});

/** All font CSS-variable classes for the root <html>. */
export const fontVariables = [
  hindSiliguri.variable,
  notoSansBengali.variable,
  ibmPlexMono.variable,
  interTight.variable,
].join(" ");

// ---- Marketing-only editorial serif faces (NOT applied app-wide) ----
// The marketing landing page uses confident serif headlines (Shopify-style
// restraint). These are scoped to app/(marketing)/layout.tsx via
// `marketingFontVariables` — admin and storefront keep Hind Siliguri.

// Bengali editorial serif (default locale).
export const notoSerifBengali = Noto_Serif_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-serif-bengali",
  display: "swap",
  preload: true,
  fallback: ["Noto Sans Bengali", "serif"],
});

// Latin editorial DISPLAY serif (English locale). Fraunces is a variable,
// high-contrast "old-style" serif with optical sizing — it gives the English
// headlines real character at large sizes (the signature scale-contrast),
// the opposite of a generic system serif. opsz lets the renderer push contrast
// up at hero scale and keep small caption serifs readable. Variable axis weight
// range covers eyebrow→hero. Kept under the existing --font-noto-serif variable
// so marketing.css and the layout need no rename churn.
export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  // Variable font: weight must be "variable" (not a list) to declare axes.
  // The wght axis then spans 100–900 automatically; marketing.css sets weights.
  weight: "variable",
  style: ["normal", "italic"],
  variable: "--font-noto-serif",
  display: "swap",
  preload: true,
  fallback: ["Georgia", "serif"],
});

// Brand wordmark / UI face — the "Hybrid" lockup, all-caps eyebrows, UI labels
// AND the English body text on the marketing landing (weight 400). Headlines
// stay Noto Serif Bengali / Fraunces. Two Latin families total (Fraunces +
// Poppins), within the font budget.
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
  preload: false,
  fallback: ["system-ui", "sans-serif"],
});

/** Serif + brand-wordmark CSS-variable classes scoped to the marketing layout. */
export const marketingFontVariables = [
  notoSerifBengali.variable,
  fraunces.variable,
  poppins.variable,
].join(" ");
