import { toBnDigits } from "../../lib/format";
import { safeUrl } from "../../lib/safeUrl";
import { PhoneIcon } from "../icons";
import type { StoreIdentity } from "./types";

interface StoreFooterProps {
  store: StoreIdentity;
  /** "en" (system default) or "bn" — pass the active locale from getDict/useDict. */
  lang?: "bn" | "en";
  /** Marketing-site URL for the "Powered by Hybrid" mark; when set it becomes a
   *  link. The storefront stays tenant white-label — this is the only Hybrid mark. */
  poweredByHref?: string;
}

const COPY = {
  bn: {
    facebook: "Facebook পেজ",
    policies: "নীতিমালা",
    privacy: "প্রাইভেসি পলিসি",
    returns: "রিটার্ন ও রিফান্ড",
    terms: "শর্তাবলী",
    payment: "পেমেন্ট",
    cod: "ক্যাশ অন ডেলিভারি",
  },
  en: {
    facebook: "Facebook page",
    policies: "Policies",
    privacy: "Privacy policy",
    returns: "Returns & refunds",
    terms: "Terms",
    payment: "Payment",
    cod: "Cash on Delivery",
  },
} as const;

// DESIGN §6.1 #7 — store info, tappable phone (Bangla digits), Facebook first
// (these sellers come from FB), policy links, payment marks, "Powered by Hybrid".
export function StoreFooter({ store, lang = "en", poweredByHref }: StoreFooterProps) {
  const phone = store.phone ?? "";
  // Seller-controlled URL: drop any non-http(s) scheme at render time.
  const facebookUrl = safeUrl(store.facebookUrl);
  const t = COPY[lang];

  return (
    <footer className="border-t border-border bg-surface-2">
      <div className="mx-auto max-w-storefront px-4 py-section">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="bn-heading text-lg font-bold text-ink">{store.name}</p>
            {phone && (
              <a
                href={`tel:${phone}`}
                className="bn-body mt-2 inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-primary"
              >
                <PhoneIcon width={16} height={16} />
                {lang === "bn" ? toBnDigits(phone) : phone}
              </a>
            )}
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bn-body mt-2 block text-sm text-primary hover:underline"
              >
                {t.facebook}
              </a>
            )}
          </div>

          <nav aria-label={t.policies} className="bn-body text-sm">
            <p className="mb-2 font-semibold text-ink">{t.policies}</p>
            <ul className="space-y-1.5 text-ink-muted">
              <li>
                <a href="/pages/privacy" className="hover:text-primary">
                  {t.privacy}
                </a>
              </li>
              <li>
                <a href="/pages/returns" className="hover:text-primary">
                  {t.returns}
                </a>
              </li>
              <li>
                <a href="/pages/terms" className="hover:text-primary">
                  {t.terms}
                </a>
              </li>
            </ul>
          </nav>

          <div className="bn-body text-sm">
            <p className="mb-2 font-semibold text-ink">{t.payment}</p>
            <div className="flex flex-wrap gap-2">
              {["bKash", "Nagad", t.cod].map((mark) => (
                <span
                  key={mark}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted"
                >
                  {mark}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center border-t border-border pt-4">
          {poweredByHref ? (
            <a
              href={poweredByHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-ink-subtle transition-colors hover:text-ink"
            >
              <img src="/hybrid-mark.webp" alt="" width={16} height={16} className="h-4 w-4" />
              Powered by Hybrid
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
              <img src="/hybrid-mark.webp" alt="" width={16} height={16} className="h-4 w-4" />
              Powered by Hybrid
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
