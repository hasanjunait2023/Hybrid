// ============================================================================
// Vitest globalSetup — ephemeral local Postgres for the RLS isolation gate.
//
// Runs ONCE in the Vitest main process (before any worker). Boots a real
// Postgres 16 via embedded-postgres on a random free port — NO Docker, NO
// system Postgres required — applies the SQL bookend files in the same lexical
// order migrate.ts uses (00_roles -> 01_schema -> 02_policies -> 03_seed ->
// 04_grant_login) over the SUPERUSER connection (so DDL + seed bypass RLS),
// then hands the connection strings to the test workers via .pgtmp.json:
//
//   DIRECT_URL   -> superuser (postgres)            -> RLS BYPASSED  (DDL/seed/admin)
//   DATABASE_URL -> app_runtime_login (non-super)   -> RLS FORCED    (withTenant)
//
// The app_runtime_login role is created by 00_roles.sql (LOGIN) and joined to
// the app_runtime group by 04_grant_login.sql — so a successful worker
// connection as that role proves the NOLOGIN-defect fix.
//
// Teardown stops the cluster and removes the temp data dir + handoff file.
// ============================================================================
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { createServer } from "node:net";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(here, "..");
const SQL_DIR = join(PKG_ROOT, "sql");
const DATA_DIR = join(PKG_ROOT, ".pgtmp");
const HANDOFF = join(PKG_ROOT, ".pgtmp.json");

// Embedded-postgres superuser. The blueprint's "postgres" superuser maps to
// whatever user we boot the cluster with; what matters is that DDL + seed run
// as a superuser (RLS bypass) and runtime connects as app_runtime_login.
const SUPERUSER = "postgres";
const SUPERPASS = "postgres";
const APP_DB = "hybrid";
const RUNTIME_USER = "app_runtime_login";
const RUNTIME_PASS = "app_runtime_local_pw";

let pg: EmbeddedPostgres | null = null;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not acquire a free port")));
      }
    });
  });
}

// SQL applied as superuser, in the SAME lexical order migrate.ts uses
// (db:migrate = 00,01,02,04 ; db:seed = 03). Here the suite needs ALL five,
// so we run every *.sql in sorted order: 00 -> 01 -> 02 -> 03 -> 04.
async function applySchema(connectionString: string): Promise<void> {
  const files = (await readdir(SQL_DIR)).filter((f) => f.endsWith(".sql")).sort();
  // Superuser connection — reuse postgres.js (already a @hybrid/db dependency).
  // .unsafe() runs a full multi-statement SQL file in one call.
  const admin = postgres(connectionString, { max: 1, prepare: false });
  try {
    for (const file of files) {
      const text = await readFile(join(SQL_DIR, file), "utf8");
      await admin.unsafe(text);
      // eslint-disable-next-line no-console
      console.log(`[pgtmp] applied ${file}`);
    }
  } finally {
    await admin.end();
  }
}

export async function setup(): Promise<void> {
  // Start from a clean data dir so order_number / seed values are deterministic.
  await rm(DATA_DIR, { recursive: true, force: true });
  await rm(HANDOFF, { force: true });

  const port = await freePort();

  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: SUPERUSER,
    password: SUPERPASS,
    port,
    persistent: false,
    authMethod: "password",
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(APP_DB);

  const host = "127.0.0.1";
  const directUrl = `postgres://${SUPERUSER}:${SUPERPASS}@${host}:${port}/${APP_DB}`;
  const databaseUrl = `postgres://${RUNTIME_USER}:${RUNTIME_PASS}@${host}:${port}/${APP_DB}`;

  await applySchema(directUrl);

  // Hand the connection strings to the test workers. setup.ts reads this and
  // sets process.env BEFORE client.ts is imported in each worker.
  await writeFile(HANDOFF, JSON.stringify({ DATABASE_URL: databaseUrl, DIRECT_URL: directUrl }), "utf8");

  // Also set in this (main) process for completeness; workers rely on the file.
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = directUrl;

  // eslint-disable-next-line no-console
  console.log(`[pgtmp] embedded Postgres ready on ${host}:${port} (db=${APP_DB})`);
}

export async function teardown(): Promise<void> {
  if (pg) {
    await pg.stop();
    pg = null;
  }
  await rm(HANDOFF, { force: true });
  await rm(DATA_DIR, { recursive: true, force: true });
}
