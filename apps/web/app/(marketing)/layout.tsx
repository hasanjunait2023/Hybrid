import type { ReactNode } from "react";
import { getMarketingLocale } from "../../lib/i18n/locale";
import { PlatformTracker } from "../_components/PlatformTracker";
import "./marketing.css";

// Marketing-only layout. The "Bazaar Modern" showroom reuses the app-wide
// Hind Siliguri + Inter Tight stack (root layout owns <html> and the font
// variables) — no marketing-specific font faces. It stamps `lang` on the
// wrapper from the resolved cookie locale so the :lang(en) CSS swaps (Latin
// display + body font, tracked eyebrows) apply correctly under the bn root.
//
// TRACK-V2-A1: include the platform-owned tracker (GA4 + Meta + TikTok +
// Clarity) — the IDs come from NEXT_PUBLIC_HYBRID_* env vars. When all
// four are unset the island is a no-op (the env reads return null and
// each injector early-returns).
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const locale = await getMarketingLocale();
  return (
    <div lang={locale} className="marketing-root">
      <PlatformTracker
        ga4Id={process.env.NEXT_PUBLIC_HYBRID_GA4_ID || null}
        fbPixelId={process.env.NEXT_PUBLIC_HYBRID_FB_PIXEL_ID || null}
        tiktokId={process.env.NEXT_PUBLIC_HYBRID_TIKTOK_ID || null}
        clarityId={process.env.NEXT_PUBLIC_HYBRID_CLARITY_ID || null}
      />
      {children}
    </div>
  );
}
