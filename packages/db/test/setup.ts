// Load local env for the RLS integration suite. In CI the vars are exported by
// the workflow; locally they come from the repo-root .env.local.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

// Only fill missing vars; never override an explicitly-exported CI value.
config({ path: join(repoRoot, ".env.local") });
