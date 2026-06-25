import type { ReactNode } from "react";
import "@hybrid/ui/globals.css";
import { fontVariables } from "./fonts";
import { getLocale } from "@/lib/i18n/server";

export const metadata = {
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
  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
