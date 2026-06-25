"use client";

// Tiny client-side translation hook for components that render OUTSIDE the
// platform/storefront LocaleProvider tree — e.g. global banners, cookie
// consent, error pages. Reads the locale from the hybrid_lang cookie at
// mount time. Returns the Messages tree for the active locale (or bn if no
// cookie is set yet, matching the root layout default).
//
// Components inside a <LocaleProvider> should prefer useDict() from
// ./provider — same shape, zero cookie read.

import { useEffect, useState } from "react";
import { LANG_COOKIE, isLocale, type Locale } from "./config";
import { getMessages, type Messages } from "./dictionaries";

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(new RegExp("(?:^|; )" + LANG_COOKIE + "=([^;]*)"));
  const v = m?.[1];
  if (v && isLocale(v)) return v;
  return "en";
}

export function useT(): Messages {
  const [messages, setMessages] = useState<Messages>(() => getMessages("en"));

  useEffect(() => {
    setMessages(getMessages(readLocaleCookie()));
  }, []);

  return messages;
}