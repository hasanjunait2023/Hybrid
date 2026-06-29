import type { ReactNode } from "react";
import { getMarketingLocale } from "../../lib/i18n/locale";
import "./marketing.css";

// Marketing-only layout. The "Bazaar Modern" showroom reuses the app-wide
// Hind Siliguri + Inter Tight stack (root layout owns <html> and the font
// variables) — no marketing-specific font faces. It stamps `lang` on the
// wrapper from the resolved cookie locale so the :lang(en) CSS swaps (Latin
// display + body font, tracked eyebrows) apply correctly under the bn root.
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const locale = await getMarketingLocale();
  return (
    <div lang={locale} className="marketing-root">
      {children}
    </div>
  );
}
