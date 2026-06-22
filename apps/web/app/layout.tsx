import type { ReactNode } from "react";
import "@hybrid/ui/globals.css";
import { fontVariables } from "./fonts";

export const metadata = {
  title: "Hybrid",
  description: "Multi-tenant commerce for Bangladesh.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Bangla is the default locale (DESIGN §0). The font CSS variables are
  // attached here so every surface (storefront/admin/marketing) inherits the
  // Hind Siliguri stack; --font-* resolve in @hybrid/ui globals.css.
  return (
    <html lang="bn" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
