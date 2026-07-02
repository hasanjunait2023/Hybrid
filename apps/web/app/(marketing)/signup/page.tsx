import type { Metadata } from "next";
import Link from "next/link";
import { ShieldIcon, TruckIcon, CheckCircleIcon, HybridLogo } from "@hybrid/ui";
import { getDict } from "@/lib/i18n/server";
import { adminLoginUrl } from "@/lib/auth/urls";
import { SignupForm } from "./SignupForm";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDict();
  return {
    title: d.auth.signup.metaTitle,
    description: d.auth.signup.metaDescription,
  };
}

// Signup surface (blueprint W3 S-MARKETING). Two-pane on desktop: a warm brand
// rail (left) carries the trust narrative so the form (right) stays focused.
// On mobile it stacks form-first — a seller on a phone wants the field, not the
// pitch. Bengali-first throughout; the only Latin is the subdomain/email input.
export default async function SignupPage() {
  const { d } = await getDict();
  const loginUrl = await adminLoginUrl();
  return (
    <main className="min-h-screen bg-bg lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand rail — hidden on mobile to keep the form above the fold */}
      <aside className="relative hidden overflow-hidden bg-primary px-10 py-section text-ink-on-primary lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-hover/60 blur-3xl"
        />
        <div className="relative">
          <Link href="/" className="inline-flex">
            <HybridLogo tone="onDark" />
          </Link>
          <h1 className="bn-heading mt-section max-w-md text-3xl font-bold">
            {d.auth.signup.railHeading}
          </h1>
          <p className="bn-body mt-4 max-w-sm text-base text-primary-weak/90">
            {d.auth.signup.railLead}
          </p>
        </div>

        <ul className="relative mt-12 space-y-4">
          <RailPoint
            icon={<CheckCircleIcon className="h-5 w-5" />}
            text={d.auth.signup.railPointLiveStore}
          />
          <RailPoint
            icon={<TruckIcon className="h-5 w-5" />}
            text={d.auth.signup.railPointCourier}
          />
          <RailPoint
            icon={<ShieldIcon className="h-5 w-5" />}
            text={d.auth.signup.railPointPayments}
          />
        </ul>
      </aside>

      {/* Form pane */}
      <section className="flex flex-col px-4 py-section sm:px-8 lg:justify-center">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile-only brand mark (rail is desktop-only) */}
          <Link href="/" className="inline-flex lg:hidden">
            <HybridLogo />
          </Link>
          <h2 className="bn-heading mt-6 text-2xl font-bold text-ink lg:mt-0">
            {d.auth.signup.formHeading}
          </h2>
          <p className="bn-body mt-2 text-sm text-ink-muted">
            {d.auth.signup.formSubtitle}
          </p>

          <div className="mt-8">
            <SignupForm
              labels={{
                typeLabel: d.auth.signup.typeLabel,
                typeRetailer: d.auth.signup.typeRetailer,
                typeRetailerHint: d.auth.signup.typeRetailerHint,
                typeWholesaler: d.auth.signup.typeWholesaler,
                typeWholesalerHint: d.auth.signup.typeWholesalerHint,
                storeNameLabel: d.auth.signup.storeNameLabel,
                storeNameHint: d.auth.signup.storeNameHint,
                storeAddressLabel: d.auth.signup.storeAddressLabel,
                storeAddressHint: d.auth.signup.storeAddressHint,
                suggestionsLabel: d.auth.signup.suggestionsLabel,
                emailLabel: d.auth.signup.emailLabel,
                passwordLabel: d.auth.signup.passwordLabel,
                passwordHint: d.auth.signup.passwordHint,
                submit: d.auth.signup.submit,
                submitting: d.auth.signup.submitting,
                trialNote: d.auth.signup.trialNote,
                oauthGoogle: d.auth.login.oauthGoogle,
                oauthFacebook: d.auth.login.oauthFacebook,
                oauthDivider: d.auth.login.divider,
              }}
            />
          </div>

          <p className="bn-body mt-6 text-center text-sm text-ink-muted">
            {d.auth.signup.haveAccount}{" "}
            <a href={loginUrl} className="font-semibold text-primary hover:underline">
              {d.auth.signup.loginCta}
            </a>
          </p>
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
