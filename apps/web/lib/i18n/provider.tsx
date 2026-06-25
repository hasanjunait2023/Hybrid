"use client";

// Client-side locale context. A panel layout (Server Component) reads the cookie
// and renders <LocaleProvider locale={locale}> high in its tree; every client
// component below calls useLocale()/useDict() to render in the active language.
// Both dictionaries are statically imported, so no message tree is serialized
// across the server→client boundary — only the two-letter locale.
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { getMessages, type Messages } from "./dictionaries";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useDict(): Messages {
  return getMessages(useLocale());
}
