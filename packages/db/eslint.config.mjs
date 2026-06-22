// packages/db OWNS the postgres.js driver and client.ts, so the no-raw-sql
// rule is intentionally NOT applied here — only the base preset.
import { base } from "@hybrid/config/eslint/base";

export default [...base];
