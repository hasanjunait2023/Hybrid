// Standalone Tailwind config for design-sync: compiles the exact utilities the
// @hybrid/ui components use into one static stylesheet (cfg.cssEntry) so
// claude.ai/design previews render fully styled. Mirrors apps/web's setup:
// the shared preset maps token CSS vars onto utilities; content is the ui src.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import preset from "../packages/config/tailwind/preset.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export default {
  presets: [preset],
  // Absolute so the glob resolves regardless of the CLI's cwd. Authored
  // previews are scanned too so any utility class they use (e.g. Skeleton
  // sizing) lands in the compiled stylesheet.
  content: [
    resolve(here, "../packages/ui/src/**/*.{tsx,ts}"),
    resolve(here, "previews/**/*.{tsx,ts}"),
  ],
  // The conventions header (readmeHeader) documents the full token vocabulary
  // for the design agent to compose with — so the shipped stylesheet must
  // contain it, not just the subset the components happened to use. Safelist
  // the documented token families so every name in conventions.md resolves.
  safelist: [
    { pattern: /^(bg|text|border)-(primary|accent|surface|bg|ink|success|cod|warning|danger|bkash)(-[a-z0-9]+)?$/ },
    { pattern: /^bg-st-(pending|confirmed|packed|shipped|delivered|returned|cancelled)(-weak)?$/ },
    { pattern: /^text-st-(pending|confirmed|packed|shipped|delivered|returned|cancelled)$/ },
    { pattern: /^rounded-(sm|md|lg|xl|full)$/ },
    { pattern: /^shadow-(xs|sm|md|lg|focus)$/ },
    { pattern: /^text-(2xs|xs|sm|base|lg|xl|2xl|3xl|4xl)$/ },
    { pattern: /^max-w-(storefront|admin|marketing)$/ },
    { pattern: /^duration-(instant|fast|base|slow)$/ },
    { pattern: /^ease-(out-soft|in-soft|move)$/ },
  ],
};
