import type { ReactNode } from "react";
import { marketingFontVariables } from "../fonts";
import { getMarketingLocale } from "../../lib/i18n/locale";
import "./marketing.css";

// Marketing-only layout. Scopes the editorial serif font variables
// (--font-noto-serif-bengali / --font-noto-serif) to the marketing route group
// so the landing page can use serif headlines, while admin and storefront keep
// the app-wide Hind Siliguri stack untouched (root layout still owns <html>).
//
// It also stamps `lang` on the wrapper from the resolved cookie locale, so the
// :lang(en) CSS swaps (serif + body font) apply correctly under the bn root.
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const locale = await getMarketingLocale();
  return (
    <div lang={locale} className={`marketing-root ${marketingFontVariables}`}>
      {children}
    </div>
  );
}
