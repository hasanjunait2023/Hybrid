import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@hybrid/ui/globals.css";
import { headers } from "next/headers";
import { fontVariables } from "./fonts";
import { getLocale } from "@/lib/i18n/server";
import { CookieConsent } from "@/lib/consent/CookieConsent";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Hybrid",
  description: "Multi-tenant commerce for Bangladesh.",
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // English is the default locale; the active language comes from the
  // hybrid_lang cookie so <html lang> matches what the user toggled. The font
  // CSS variables are attached here so every surface (storefront/admin/
  // marketing) inherits the Hind Siliguri stack; --font-* resolve in
  // @hybrid/ui globals.css.
  const locale = await getLocale();
  const host = (await headers()).get("host") ?? "";
  const isEcomexCloud = host.includes(".ecomex.cloud");

  return (
    <html lang={locale} className={fontVariables}>
      <head>
        {isEcomexCloud ? (
          <meta
            name="google-site-verification"
            content="jfegcQr5aSi9_cxMZ7rCq3teT3f2iWN0FzPAz8xez98"
          />
        ) : null}
      </head>
      <body>
        {children}
        <CookieConsent />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
