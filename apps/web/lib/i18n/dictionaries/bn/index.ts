// Bangla dictionary — typed as Messages, so TypeScript fails the build if any
// namespace drifts from the English shape.
import type { Messages } from "../en";
import { common } from "./common";
import { admin } from "./admin";
import { platform } from "./platform";
import { storefront } from "./storefront";

export const bn: Messages = { common, admin, platform, storefront };
