import type { ReactNode } from "react";
import "@hybrid/ui/globals.css";

export const metadata = {
  title: "Hybrid",
  description: "Multi-tenant commerce for Bangladesh.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
