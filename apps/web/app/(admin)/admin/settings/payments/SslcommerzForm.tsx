"use client";

// SSLCommerz provider config (DESIGN §Q4). {store_id, store_password}. THE
// silent-failure guard: the IPN URL CopyField is non-optional — the seller must
// register this exact IPN URL in the SSLCommerz merchant panel or payments never
// confirm in Hybrid.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, CopyField, TestConnectionButton, ShieldIcon } from "@hybrid/ui";
import type { SslcommerzSettings } from "@/lib/admin/settings";
import { saveSslcommerz } from "./actions";
import { testSslcommerz } from "../test-connection/actions";
import { ModeChip } from "../ModeChip";

export function SslcommerzForm({
  settings,
  ipnUrl,
}: {
  settings: SslcommerzSettings;
  ipnUrl: string | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mode, setMode] = useState<"sandbox" | "live">(settings.mode);
  const [storeId, setStoreId] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("mode", mode);
    fd.set("storeId", storeId);
    fd.set("storePassword", storePassword);
    startTransition(async () => {
      const result = await saveSslcommerz(null, fd);
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        setStoreId("");
        setStorePassword("");
        router.refresh();
      }
    });
  }

  return (
    <ProviderCard
      icon={<ShieldIcon className="h-6 w-6" />}
      title="SSLCommerz"
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      mode={<ModeChip mode={mode} onChange={setMode} />}
      callback={
        <div className="space-y-1.5 rounded-md bg-surface-2 p-3">
          <CopyField label="IPN URL" value={ipnUrl ?? ""} />
          {ipnUrl ? (
            <p className="text-2xs font-medium text-warning">
              এই URL আপনার SSLCommerz প্যানেলে IPN হিসেবে রেজিস্টার করুন — না করলে পেমেন্ট কনফার্ম হবে না।
            </p>
          ) : (
            <p className="text-2xs font-medium text-ink-muted">
              আগে একটি ডোমেইন ভেরিফাই করুন — তারপর সঠিক IPN URL এখানে দেখা যাবে।
            </p>
          )}
        </div>
      }
      test={<TestConnectionButton onTest={testSslcommerz} disabled={!settings.configured} />}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <CredentialField id="ssl-storeId" label="store_id" value={storeId} onChange={setStoreId} hint={settings.storeIdHint} />
      <CredentialField id="ssl-storePassword" label="store_password" value={storePassword} onChange={setStorePassword} type="password" />
    </ProviderCard>
  );
}
