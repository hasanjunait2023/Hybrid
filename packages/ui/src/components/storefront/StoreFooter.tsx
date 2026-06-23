import { toBnDigits } from "../../lib/format";
import { safeUrl } from "../../lib/safeUrl";
import { PhoneIcon } from "../icons";
import type { StoreIdentity } from "./types";

interface StoreFooterProps {
  store: StoreIdentity;
}

// DESIGN §6.1 #7 — store info, tappable phone (Bangla digits), Facebook first
// (these sellers come from FB), policy links, payment marks, "Powered by Hybrid".
export function StoreFooter({ store }: StoreFooterProps) {
  const phone = store.phone ?? "";
  // Seller-controlled URL: drop any non-http(s) scheme at render time.
  const facebookUrl = safeUrl(store.facebookUrl);

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
                {toBnDigits(phone)}
              </a>
            )}
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bn-body mt-2 block text-sm text-primary hover:underline"
              >
                Facebook পেজ
              </a>
            )}
          </div>

          <nav aria-label="নীতিমালা" className="bn-body text-sm">
            <p className="mb-2 font-semibold text-ink">নীতিমালা</p>
            <ul className="space-y-1.5 text-ink-muted">
              <li>
                <a href="/pages/privacy" className="hover:text-primary">
                  প্রাইভেসি পলিসি
                </a>
              </li>
              <li>
                <a href="/pages/returns" className="hover:text-primary">
                  রিটার্ন ও রিফান্ড
                </a>
              </li>
              <li>
                <a href="/pages/terms" className="hover:text-primary">
                  শর্তাবলী
                </a>
              </li>
            </ul>
          </nav>

          <div className="bn-body text-sm">
            <p className="mb-2 font-semibold text-ink">পেমেন্ট</p>
            <div className="flex flex-wrap gap-2">
              {["bKash", "Nagad", "ক্যাশ অন ডেলিভারি"].map((mark) => (
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

        <div className="mt-8 border-t border-border pt-4 text-center">
          <span className="text-xs text-ink-subtle">Powered by Hybrid</span>
        </div>
      </div>
    </footer>
  );
}
