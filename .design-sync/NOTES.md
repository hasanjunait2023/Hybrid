# design-sync NOTES — @hybrid/ui → "Hybrid UI Kit"

Project: Hybrid UI Kit · projectId e8918a56-20d8-41a4-8aae-79f6d0e728dc
(separate from the pre-existing, richer "Hybrid Design System" f733dac1-… — do NOT overwrite that one.)

## State (2026-06-24, session 2) — BLOCKER RESOLVED, build verifies, NOT yet uploaded
- shape=package. @hybrid/ui ships RAW TS source — no committed build.
- Prebuild produces both artifacts the converter needs:
  `node .design-sync/prebuild.mjs`
    1. tsc → packages/ui/dist (index.js + 26 .d.ts)
    2. tailwind → packages/ui/dist/ds-compiled.css (preflight + utilities + tokens)
  Run it BEFORE the converter — resync.mjs/package-build.mjs do NOT build the pkg.
- Converter cmd:
  `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./apps/web/node_modules --entry ./packages/ui/dist/index.js --out ./ds-bundle`

## ROOT CAUSE of the old [ZERO_MATCH] (fixed)
- dts.mjs `projectFor` set ts-morph `entry = pkgDir + (pkgJson.types || 'index.d.ts')`.
  packages/ui/package.json had NO `types` field → entry = packages/ui/index.d.ts (absent)
  → getSourceFile(entry) undefined → 0 exported names → ZERO_MATCH. (findTypesRoot's
  dir-scan still loaded dist's 26 .d.ts, hence the misleading "parsed 26" log.)
- FIX: added `"types": "dist/index.d.ts"` to packages/ui/package.json. entry + root now
  both = dist/index.d.ts → 41 components discovered (20 primitives/sections + 20 icons;
  helpers cn/toBnDigits and ALL-CAPS UI_PACKAGE auto-excluded). No converter/lib edit.
- Also fixed config: `tsconfig` is PKG_DIR-relative → "tsconfig.json" (was the doubled
  "packages/ui/tsconfig.json", which resolved under PKG_DIR and "not found"-warned).

## Tailwind (resolved)
- globals.css is only @tailwind directives + :root tokens — NO utilities. Standalone
  compile via `.design-sync/tailwind.config.mjs` (presets:[shared preset], content:
  abs path to packages/ui/src/**; ADD .design-sync/previews/** so authored-preview
  classes compile too). Output cfg.cssEntry="dist/ds-compiled.css" (must live under
  PKG_DIR — cssEntry is bounded to the package).

## Previews / render gate (resolved)
- Package shape has NO generated preview tier — previews are floor cards unless authored
  in .design-sync/previews/<Name>.tsx (markerless; import from "@hybrid/ui" → bundle global).
- Authored 20 icon previews (icons render blank/thin bare at 20px currentColor) — each
  renders the glyph at 48/32/24px in indigo. Render check: 41/41 clean after that.
- 8 components still on the floor card: Button, Badge, StatusBadge, EmptyState, Skeleton,
  CredentialField, ProductCard, StickyActionBar. (StickyActionBar is position:fixed
  md:hidden — genuinely hard to preview at desktop capture width; leave as floor card.)
  Authoring rich previews for the other 7 is the next quality step.
- Playwright render check: chromium download fails — DISK 100% FULL. Reuse the existing
  cache build instead:
  DS_CHROMIUM_PATH="C:\Users\Junait\AppData\Local\ms-playwright\chromium-1223\chrome-win64\chrome.exe"
  node .ds-sync/package-validate.mjs ./ds-bundle   → "bundle is complete".

## REMAINING to finish the sync
1. (optional quality) author rich previews for the 7 floor-card components, rebuild, re-render-check.
2. Author .design-sync/conventions.md (readmeHeader) — wrapping/provider, the Tailwind
   class vocabulary (bg-primary, text-ink, st-* …), where styles live, one build snippet.
3. Rebuild (DRIVER run, no --remote on first sync) so README carries the header.
4. Upload: projectId pinned BEFORE the run → ATOMIC path (per skill §1). Verify list_files,
   finalize_plan, write_files (≤256/call), _ds_sync.json LAST, sentinel fenced.

## Re-sync risks
- dist + ds-compiled.css are build output (gitignore-worthy, not committed). prebuild regenerates.
- If @hybrid/ui adds a real build script, prefer it and update prebuild.mjs / buildCmd.
