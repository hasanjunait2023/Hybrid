// design-sync prebuild for @hybrid/ui. Run from repo root BEFORE the converter
// (package-build.mjs / resync.mjs), which does not build the package itself:
//
//   node .design-sync/prebuild.mjs
//
// Produces the two artifacts the converter consumes:
//   1. packages/ui/dist/        — tsc emit (index.js + .d.ts tree). The .d.ts
//      tree drives component discovery; dist/index.d.ts must be the `types`
//      entry in packages/ui/package.json so ts-morph resolves the re-exports.
//   2. packages/ui/dist/ds-compiled.css — the standalone Tailwind stylesheet
//      (preflight + every utility the components use, mapped to the token
//      vars + the :root token block from globals.css). cfg.cssEntry points
//      here so claude.ai/design previews render fully styled. globals.css
//      alone is only @tailwind directives + tokens — NO compiled utilities.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const uiDir = resolve(repo, "packages/ui");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const node = (jsAndArgs, cwd) => run(process.execPath, jsAndArgs, cwd);

// 1. tsc → dist (declarations + JS). Run tsc's JS entry via node so no shell
//    quoting is involved (the repo path contains a space).
const tsc = resolve(uiDir, "node_modules/typescript/bin/tsc");
node([tsc, "-p", "tsconfig.json", "--noEmit", "false", "--declaration",
  "--sourceMap", "false", "--outDir", "dist", "--skipLibCheck"], uiDir);

// 2. Tailwind → dist/ds-compiled.css (uses apps/web's tailwindcss CLI JS;
//    packages/ui has no tailwind dep of its own). node lib/cli.js avoids the
//    extensionless .bin shim that breaks under cmd.exe with spaced paths.
const twCli = resolve(repo, "apps/web/node_modules/tailwindcss/lib/cli.js");
node([twCli, "-c", resolve(here, "tailwind.config.mjs"),
  "-i", resolve(uiDir, "src/globals.css"),
  "-o", resolve(uiDir, "dist/ds-compiled.css"), "--minify"], repo);

console.log("\n[prebuild] dist + dist/ds-compiled.css ready");
