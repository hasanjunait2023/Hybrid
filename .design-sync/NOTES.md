# design-sync NOTES — @hybrid/ui → "Hybrid UI Kit"

Project: Hybrid UI Kit · projectId e8918a56-20d8-41a4-8aae-79f6d0e728dc
(separate from the pre-existing, richer "Hybrid Design System" f733dac1-… — do NOT overwrite that one.)

## State at checkpoint (2026-06-24)
- shape=package. @hybrid/ui ships RAW TS source — no build, no dist, no .d.ts.
- Added a build: `buildCmd` = tsc emit to packages/ui/dist (index.js + .d.ts + components/ + lib/). It works (26 .d.ts emitted).
- node_modules: pass `--node-modules ./apps/web/node_modules` (has react + react-dom + the @hybrid/ui symlink; packages/ui/node_modules lacks react-dom).
- Build cmd run: `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./apps/web/node_modules --entry ./packages/ui/dist/index.js --out ./ds-bundle`

## BLOCKER (next session starts here)
- Converter returns `[ZERO_MATCH] no PascalCase exports` even though `[DTS] parsed 26 .d.ts files from packages/ui/dist`.
- Root cause hypothesis: ts-morph export discovery (lib/source-kit.mjs `exportedNames`) is NOT resolving the RE-EXPORTS in dist/index.d.ts (`export { Button } from "./components/Button"`). The hand-emitted dist may lack the module-resolution context ts-morph needs.
- Fix options to try, in order:
  1. Add `cfg.componentSrcMap` enumerating each component → its SRC .tsx path (Button→src/components/Button.tsx, … storefront/* → src/components/storefront/*.tsx). ~30 entries. Most deterministic. Helpers cn/toBnDigits and ALL-CAPS UI_PACKAGE are auto-excluded; icons are PascalCase fn exports in src/components/icons.tsx (one file, many exports — may need pins).
  2. OR ensure ts-morph reads with proper resolution: cfg.tsconfig already set to packages/ui/tsconfig.json — confirm the converter passes it to ts-morph for the .d.ts program; if not, an override in .design-sync/overrides/source-kit.mjs may be needed.
  3. OR flatten the entry: point --entry at a single barrel where exports are declared inline.

## Tailwind CSS (still TODO — needed for STYLED previews)
- globals.css is ONLY `@tailwind base/components/utilities` + `:root` token vars + @layer — NO compiled utilities. Components use Tailwind classes (bg-primary, px-4, rounded-lg…) generated at build by @hybrid/config/tailwind/preset.mjs.
- Action: compile a standalone stylesheet — run tailwindcss with the preset, content = packages/ui/src/**/*.tsx, input = globals.css → e.g. .design-sync/compiled.css; set cfg.cssEntry to it. Without this, previews render UNSTYLED (only token vars resolve, no utilities).

## Other
- Playwright/chromium NOT installed yet (render check). Decide install (~200MB) vs `--no-render-check` (strained env).
- Preview scope chosen: FLOOR CARDS for all (option c) — fastest; rich previews authorable on a later re-sync.
- Converter deps installed in .ds-sync/ (esbuild, ts-morph, @types/react).

## Re-sync risks
- The dist is hand-emitted by tsc (not a repo build script). If @hybrid/ui adds a real build, prefer it and update buildCmd.
- packages/ui/dist is gitignored-worthy build output (not committed).
