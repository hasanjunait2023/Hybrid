// Per-worker setup for the RLS integration suite. Runs in EACH Vitest worker
// BEFORE the test module (and therefore before client.ts, which reads
// DATABASE_URL/DIRECT_URL at import) is evaluated.
//
// Source of the connection strings, in priority order:
//   1. .pgtmp.json written by global-setup.ts (embedded-postgres — the default,
//      needs NO Docker and NO system Postgres; runs anywhere).
//   2. repo-root .env.local (the Docker / system-Postgres path, for devs who
//      prefer docker-compose). Only fills vars still missing.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const repoRoot = join(pkgRoot, "..", "..");
const handoff = join(pkgRoot, ".pgtmp.json");

// 1. Embedded-postgres handoff (preferred). global-setup.ts always writes this.
try {
  const raw = readFileSync(handoff, "utf8");
  const conn = JSON.parse(raw) as { DATABASE_URL?: string; DIRECT_URL?: string };
  if (conn.DATABASE_URL) process.env.DATABASE_URL = conn.DATABASE_URL;
  if (conn.DIRECT_URL) process.env.DIRECT_URL = conn.DIRECT_URL;
} catch {
  // No handoff file — fall through to the Docker / .env.local path below.
}

// 2. Docker / system-Postgres fallback. Only fills vars still missing.
config({ path: join(repoRoot, ".env.local") });
