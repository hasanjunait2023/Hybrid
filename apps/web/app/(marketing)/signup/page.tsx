import Link from "next/link";
import { ShieldIcon, TruckIcon, CheckCircleIcon } from "@hybrid/ui";
import { SignupForm } from "./SignupForm";

export const metadata = {
  title: "দোকান খুলুন — Hybrid",
  description: "মিনিটেই আপনার অনলাইন দোকান চালু করুন। ১৪ দিন ফ্রি ট্রায়াল।",
};

// Signup surface (blueprint W3 S-MARKETING). Two-pane on desktop: a warm brand
// rail (left) carries the trust narrative so the form (right) stays focused.
// On mobile it stacks form-first — a seller on a phone wants the field, not the
// pitch. Bengali-first throughout; the only Latin is the subdomain/email input.
export default function SignupPage() {
  return (
    <main className="min-h-screen bg-bg lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand rail — hidden on mobile to keep the form above the fold */}
      <aside className="relative hidden overflow-hidden bg-primary px-10 py-section text-ink-on-primary lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-hover/60 blur-3xl"
        />
        <div className="relative">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Hybrid
          </Link>
          <h1 className="bn-heading mt-section max-w-md text-3xl font-bold">
            আজই শুরু করুন। বিক্রি শুরু হোক আগামীকাল থেকে।
          </h1>
          <p className="bn-body mt-4 max-w-sm text-base text-primary-weak/90">
            ফেসবুক পেজ থেকে সত্যিকারের শপে — সাবডোমেইনে লাইভ স্টোরফ্রন্ট, ক্যাশ অন
            ডেলিভারি, bKash আর কুরিয়ার, সব বাংলায়।
          </p>
        </div>

        <ul className="relative mt-12 space-y-4">
          <RailPoint
            icon={<CheckCircleIcon className="h-5 w-5" />}
            text="মিনিটেই নিজের ঠিকানায় লাইভ দোকান"
          />
          <RailPoint
            icon={<TruckIcon className="h-5 w-5" />}
            text="স্টেডফাস্ট কুরিয়ারে এক ক্লিকে পার্সেল বুকিং"
          />
          <RailPoint
            icon={<ShieldIcon className="h-5 w-5" />}
            text="ক্যাশ অন ডেলিভারি ও bKash — নিরাপদ পেমেন্ট"
          />
        </ul>
      </aside>

      {/* Form pane */}
      <section className="flex flex-col px-4 py-section sm:px-8 lg:justify-center">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile-only brand mark (rail is desktop-only) */}
          <Link href="/" className="text-lg font-bold tracking-tight text-ink lg:hidden">
            Hybrid
          </Link>
          <h2 className="bn-heading mt-6 text-2xl font-bold text-ink lg:mt-0">
            আপনার দোকান তৈরি করুন
          </h2>
          <p className="bn-body mt-2 text-sm text-ink-muted">
            কোনো কার্ড লাগবে না। ১৪ দিনের ফ্রি ট্রায়াল।
          </p>

          <div className="mt-8">
            <SignupForm />
          </div>
        </div>
      </section>
    </main>
  );
}

function RailPoint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-hover/50 text-ink-on-primary">
        {icon}
      </span>
      <span className="bn-body text-base text-primary-weak/95">{text}</span>
    </li>
  );
}
