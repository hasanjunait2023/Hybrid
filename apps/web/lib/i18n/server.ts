// Server-side locale resolution. Reads the hybrid_lang cookie and hands back the
// active locale + its message tree. Import only from Server Components / Server
// Actions — it calls next/headers cookies(), which already errors in a Client
// Component.
import { cookies } from "next/headers";
import { LANG_COOKIE, resolveLocale, type Locale } from "./config";
import { getMessages, type Messages } from "./dictionaries";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LANG_COOKIE)?.value);
}

/** Active locale + its dictionary, resolved from the cookie. */
export async function getDict(): Promise<{ locale: Locale; d: Messages }> {
  const locale = await getLocale();
  return { locale, d: getMessages(locale) };
}
