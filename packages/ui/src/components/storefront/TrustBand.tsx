import { PhoneIcon, ShieldIcon, TruckIcon } from "../icons";
import { CheckIcon } from "../icons";

interface TrustBandProps {
  /** "en" (system default) or "bn" — pass the active locale from getDict/useDict. */
  lang?: "bn" | "en";
}

// DESIGN §6.1 #6 — full-width reassurance band before the footer. Repeats the
// core promises with icons. Surface-2 bg, no heavy imagery (3G-cheap).
const PROMISES = {
  bn: [
    { Icon: CheckIcon, label: "ক্যাশ অন ডেলিভারি", sub: "হাতে পেয়ে টাকা দিন" },
    { Icon: TruckIcon, label: "সারা দেশে ডেলিভারি", sub: "Steadfast · Pathao" },
    { Icon: ShieldIcon, label: "অরিজিনাল প্রোডাক্ট", sub: "৭ দিনে রিটার্ন" },
    { Icon: PhoneIcon, label: "হটলাইন সাপোর্ট", sub: "সকাল ৯টা — রাত ৯টা" },
  ],
  en: [
    { Icon: CheckIcon, label: "Cash on Delivery", sub: "Pay when you receive" },
    { Icon: TruckIcon, label: "Nationwide delivery", sub: "Steadfast · Pathao" },
    { Icon: ShieldIcon, label: "Authentic products", sub: "7-day returns" },
    { Icon: PhoneIcon, label: "Hotline support", sub: "9am — 9pm" },
  ],
} as const;

export function TrustBand({ lang = "en" }: TrustBandProps) {
  return (
    <section className="bg-surface-2">
      <div className="mx-auto grid max-w-storefront grid-cols-2 gap-4 px-4 py-section md:grid-cols-4">
        {PROMISES[lang].map(({ Icon, label, sub }) => (
          <div key={label} className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-cod-weak text-cod">
              <Icon />
            </span>
            <div>
              <p className="bn-body text-sm font-semibold text-ink">{label}</p>
              <p className="bn-body text-xs text-ink-muted">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
