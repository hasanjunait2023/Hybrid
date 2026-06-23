// @hybrid/payments is a PURE package (no Next, no DB, no env reads). The base
// preset is sufficient; no-raw-sql is irrelevant here since it never imports
// the driver. fetch + token store are injected, so nothing is forbidden.
import { base } from "@hybrid/config/eslint/base";

export default [...base];
