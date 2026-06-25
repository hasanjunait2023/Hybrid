// i18n core config. The whole app is bilingual EN/BN with English as the
// DEFAULT; users flip to Bangla via a cookie-backed toggle. The underlying data
// (money, dates) is always Latin in the DB — only the view layer localizes.
//
// One cookie drives everything: `hybrid_lang` (reused from the original
// marketing toggle). Server reads it via next/headers; the client toggle writes
// it then refreshes. No locale in the URL — keeps the host→tenant middleware
// rewrite untouched.

export type Locale = "en" | "bn";

export const LOCALES: readonly Locale[] = ["en", "bn"];

/** English is the system default (changed from the original Bangla-first). */
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie name — shared with the legacy marketing LangToggle. */
export const LANG_COOKIE = "hybrid_lang";

/** One year, in seconds — toggle persists per browser. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "bn";
}

/** Normalize any cookie value to a valid locale, falling back to the default. */
export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function otherLocale(locale: Locale): Locale {
  return locale === "bn" ? "en" : "bn";
}
