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
import { Hind_Siliguri, Noto_Sans_Bengali, IBM_Plex_Mono, Inter_Tight } from "next/font/google";

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
