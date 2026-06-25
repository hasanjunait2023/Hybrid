// Dictionary registry. Both languages are bundled (they are just strings) so a
// single static import serves server and client alike — no per-request
// serialization of the message tree.
import type { Locale } from "../config";
import { en, type Messages } from "./en";
import { bn } from "./bn";

export type { Messages };

export const DICTS: Record<Locale, Messages> = { en, bn };

export function getMessages(locale: Locale): Messages {
  return DICTS[locale];
}
