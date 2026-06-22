// Generate TS row/enum types by introspecting DIRECT_URL (local Docker Postgres)
// via kysely-codegen, writing to src/types.ts. We consume types only — the
// Kysely query builder is NOT adopted (tenant queries use postgres.js `tx`).
//
// Usage: tsx scripts/generate-types.ts   (wired as `db:gen`)
// CI runs this then `git diff --exit-code src/types.ts` to catch schema drift.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "types.ts");

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("[db:gen] DIRECT_URL is required");
  process.exit(1);
}

const result = spawnSync(
  "kysely-codegen",
  [
    "--dialect",
    "postgres",
    "--url",
    url,
    "--out-file",
    OUT,
    "--schema",
    "public",
    "--camel-case",
  ],
  { stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
