import { PhoneIcon, ShieldIcon, TruckIcon } from "../icons";
import { CheckIcon } from "../icons";

// DESIGN §6.1 #6 — full-width reassurance band before the footer. Repeats the
// core promises with icons. Surface-2 bg, no heavy imagery (3G-cheap).
const PROMISES = [
  { Icon: CheckIcon, label: "ক্যাশ অন ডেলিভারি", sub: "হাতে পেয়ে টাকা দিন" },
  { Icon: TruckIcon, label: "সারা দেশে ডেলিভারি", sub: "Steadfast · Pathao" },
  { Icon: ShieldIcon, label: "অরিজিনাল প্রোডাক্ট", sub: "৭ দিনে রিটার্ন" },
  { Icon: PhoneIcon, label: "হটলাইন সাপোর্ট", sub: "সকাল ৯টা — রাত ৯টা" },
];

export function TrustBand() {
  return (
    <section className="bg-surface-2">
      <div className="mx-auto grid max-w-storefront grid-cols-2 gap-4 px-4 py-section md:grid-cols-4">
        {PROMISES.map(({ Icon, label, sub }) => (
          <div key={label} className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cod-weak text-cod">
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
