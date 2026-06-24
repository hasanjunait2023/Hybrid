"use client";

// Steadfast courier config — refactored onto the shared <ProviderCard> (DESIGN
// §Q4). Honest "no sandbox" note (Steadfast has no test env — brief §2). Secret
// fields are write-only; blank keeps the saved value. Test Connection calls the
// real getBalance.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, TestConnectionButton, TruckIcon } from "@hybrid/ui";
import type { CourierSettings } from "@/lib/admin/settings";
import { saveSteadfast } from "./actions";
import { testSteadfast } from "../test-connection/actions";

export function SteadfastForm({ settings }: { settings: CourierSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("apiKey", apiKey);
    fd.set("secretKey", secretKey);
    startTransition(async () => {
      const result = await saveSteadfast(null, fd);
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        setApiKey("");
        setSecretKey("");
        router.refresh();
      }
    });
  }

  return (
    <ProviderCard
      icon={<TruckIcon className="h-6 w-6" />}
      title="Steadfast"
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      mode={
        <p className="rounded-md bg-warning-weak px-3 py-2 text-xs font-medium text-warning">
          ⚠ Steadfast-এর কোনো স্যান্ডবক্স নেই — লাইভ ডেলিভারির জন্য portal.steadfast.com.bd-এ আসল
          মার্চেন্ট অ্যাকাউন্ট লাগবে।
        </p>
      }
      test={<TestConnectionButton onTest={testSteadfast} disabled={!settings.configured} />}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <CredentialField id="st-apiKey" label="Api-Key" value={apiKey} onChange={setApiKey} hint={settings.apiKeyHint} />
      <CredentialField id="st-secretKey" label="Secret-Key" value={secretKey} onChange={setSecretKey} type="password" hint={settings.configured ? "••••" : null} />
    </ProviderCard>
  );
}
