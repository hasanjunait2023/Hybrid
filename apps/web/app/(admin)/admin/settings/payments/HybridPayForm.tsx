"use client";

// Hybrid Pay onboarding + config (the tenant's single online gateway). This one
// card walks a seller through self-serve setup:
//   1. Install the Hybrid Pay companion app on the phone holding their MFS number.
//   2. Enter the MFS number that will receive payments (bKash/Nagad/Rocket).
//   3. Paste their Hybrid Pay API key.
//   4. Whitelist the shown webhook URL in their Hybrid Pay brand (silent-failure
//      guard — without it, payments settle at the gateway but never confirm here).
// Once enabled, payments to their number auto-verify (companion app → webhook).
//
// Copy is inline Bengali (operator-facing admin surface); move to the i18n dict
// if/when this card is localized to English. Secrets are write-masked.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, CopyField } from "@hybrid/ui";
import type { HybridpaySettings } from "@/lib/admin/settings";
import { saveHybridpay } from "./actions";

const COMPANION_APP_URL =
  "https://play.google.com/store/apps/details?id=com.qubeplug.billpax_tools";

export function HybridPayForm({
  settings,
  webhookUrl,
}: {
  settings: HybridpaySettings;
  webhookUrl: string | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mobileNumber, setMobileNumber] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("apiKey", apiKey);
    fd.set("mobileNumber", mobileNumber);
    startTransition(async () => {
      const result = await saveHybridpay(null, fd);
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        setApiKey("");
        router.refresh();
      }
    });
  }

  return (
    <ProviderCard
      icon={<WalletIcon className="h-6 w-6" />}
      title="Hybrid Pay"
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      callback={
        <div className="space-y-1.5 rounded-md bg-surface-2 p-3">
          <CopyField label="Webhook URL" value={webhookUrl ?? ""} />
          {webhookUrl ? (
            <p className="text-2xs font-medium text-warning">
              এই URL আপনার Hybrid Pay ব্র্যান্ডের &ldquo;Domains&rdquo; এ যোগ ও active করুন —
              নাহলে পেমেন্ট কনফার্ম হবে না।
            </p>
          ) : (
            <p className="text-2xs font-medium text-ink-muted">
              প্রথমে একটি ডোমেইন verify করুন, তারপর এই URL দেখা যাবে।
            </p>
          )}
        </div>
      }
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      {/* Onboarding steps */}
      <ol className="space-y-2 rounded-md bg-primary-weak p-3 text-sm text-ink">
        <li>
          <span className="font-semibold">১.</span> ফোনে{" "}
          <a
            href={COMPANION_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline"
          >
            Hybrid Pay অ্যাপটি
          </a>{" "}
          ইনস্টল করে আপনার ব্র্যান্ডে লগইন করুন।
        </li>
        <li>
          <span className="font-semibold">২.</span> যে নম্বরে পেমেন্ট নেবেন (বিকাশ/নগদ) সেটি দিন।
        </li>
        <li>
          <span className="font-semibold">৩.</span> আপনার Hybrid Pay API key দিন ও Save করুন।
        </li>
      </ol>

      <CredentialField
        id="hp-mobile"
        label="পেমেন্ট নম্বর (বিকাশ/নগদ)"
        value={mobileNumber}
        onChange={setMobileNumber}
        hint={settings.apiKeyHint ? "সেট করা আছে" : undefined}
      />
      <CredentialField
        id="hp-apiKey"
        label="API key"
        value={apiKey}
        onChange={setApiKey}
        type="password"
        hint={settings.apiKeyHint}
      />
    </ProviderCard>
  );
}

// Simple wallet glyph (brand indigo via currentColor).
function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
