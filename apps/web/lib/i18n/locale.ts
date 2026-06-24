// Server-side marketing locale resolution from the `hybrid_lang` cookie.
//
// Read in a Server Component (page/layout) so SSR renders the right language
// with no hydration flash. Bangla is the default when the cookie is absent or
// holds an unknown value.

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, type Locale } from "./marketing";

/** Cookie name shared by the server reader and the client LangToggle. */
export const LANG_COOKIE = "hybrid_lang";

/** One year, in seconds — toggle persistence across reloads. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "bn";
}

/** Resolve the active marketing locale from the request cookie (default bn). */
export async function getMarketingLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LANG_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}
