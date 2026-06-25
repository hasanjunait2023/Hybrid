// English dictionary — the canonical key set. The Messages type is derived from
// this object, so every Bangla namespace must mirror its exact shape.
import { common } from "./common";
import { admin } from "./admin";
import { platform } from "./platform";
import { storefront } from "./storefront";

export const en = { common, admin, platform, storefront };

export type Messages = typeof en;
