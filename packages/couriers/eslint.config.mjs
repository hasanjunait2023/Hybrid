// @hybrid/couriers is a PURE package (no Next, no DB, no env reads). The fetch
// transport + creds are injected per-call, so the base preset suffices.
import { base } from "@hybrid/config/eslint/base";

export default [...base];
