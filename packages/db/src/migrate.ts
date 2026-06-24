// Apply SQL files in lexical order over the DIRECT_URL (superuser) connection,
// recording each in a `_migrations` ledger so re-runs are idempotent.
//
//   db:migrate -> applies 00,01,02,04,06,07,08 (roles, schema, policies, grant,
//                 own-auth, phase2 feature columns, perf indexes)
//   db:seed    -> applies 03 (seed)
//
// Phase 2 (SHIFT 1): 05_auth.sql (the Supabase on_auth_user_created trigger) was
// removed from disk; own auth ships in 06_own_auth.sql (user_session/otp_code +
// app_user.password_hash). 07_phase2.sql adds the COD-reconciliation batch-state
// columns to cod_remittance (status/processed_at/unmatched_count). 08_perf_indexes.sql
// adds leading-tenant_id indexes for all RLS-filtered tables that had a gap (partial
// or missing index), and enables pg_stat_statements. pickFiles globs by prefix, so
// 06, 07, and 08 are picked up by the migrate set automatically (in lexical order,
// after 04) and 05 simply no longer exists to apply.
//
// docker-compose also auto-applies the same files on first boot via
// /docker-entrypoint-initdb.d; this script is the explicit/CI path and is safe
// to run against an already-initialised database (ledger skips applied files).
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { adminSql } from "./client";

const here = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(here, "..", "sql");

async function ensureLedger(): Promise<void> {
  await adminSql`
    create table if not exists _migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `;
}

async function appliedSet(): Promise<Set<string>> {
  const rows = await adminSql<{ filename: string }[]>`select filename from _migrations`;
  return new Set(rows.map((r) => r.filename));
}

async function applyFile(filename: string): Promise<void> {
  const sqlText = await readFile(join(SQL_DIR, filename), "utf8");
  // adminSql.unsafe runs the full multi-statement file. Wrap file + ledger
  // insert in one transaction so a partial file never marks itself applied.
  await adminSql.begin(async (tx) => {
    await tx.unsafe(sqlText);
    await tx`insert into _migrations (filename) values (${filename})`;
  });
  console.warn(`[migrate] applied ${filename}`);
}

// Select files by lexical prefix. migrate -> 00,01,02,04,06,07 ; seed -> 03.
async function pickFiles(mode: "migrate" | "seed"): Promise<string[]> {
  const all = (await readdir(SQL_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (mode === "seed") return all.filter((f) => f.startsWith("03_"));
  return all.filter((f) => !f.startsWith("03_"));
}

export async function run(mode: "migrate" | "seed"): Promise<void> {
  await ensureLedger();
  const done = await appliedSet();
  const files = await pickFiles(mode);
  for (const f of files) {
    if (done.has(f)) {
      console.warn(`[migrate] skip ${f} (already applied)`);
      continue;
    }
    await applyFile(f);
  }
}

const mode: "migrate" | "seed" = process.argv.includes("--seed") ? "seed" : "migrate";
run(mode)
  .then(() => adminSql.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[migrate] failed:", err);
    await adminSql.end();
    process.exit(1);
  });
