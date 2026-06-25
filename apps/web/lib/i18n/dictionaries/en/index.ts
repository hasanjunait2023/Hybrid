// English dictionary — the canonical key set. The Messages type is derived from
// this object, so every Bangla namespace must mirror its exact shape.
import { common } from "./common";
import { admin } from "./admin";
import { platform } from "./platform";
import { storefront } from "./storefront";
import { auth } from "./auth";

export const en = { common, admin, platform, storefront, auth };

export type Messages = typeof en;
