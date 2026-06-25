"use client";

// Nagad provider config (DESIGN §Q4). Per-merchant RSA keys (NOT OAuth):
// merchant_id + merchant_private_key (PEM, multi-line) + nagad_public_key.
// THE silent-failure guard: the callback URL CopyField is non-optional — without
// the seller pasting the EXACT URL into the Nagad portal, payments succeed at the
// gateway but never confirm in Hybrid.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, CopyField, TestConnectionButton, ShieldIcon } from "@hybrid/ui";
import type { NagadSettings } from "@/lib/admin/settings";
import { useDict } from "@/lib/i18n/provider";
import { saveNagad } from "./actions";
import { testNagad } from "../test-connection/actions";
import { ModeChip } from "../ModeChip";

export function NagadForm({
  settings,
  callbackUrl,
}: {
  settings: NagadSettings;
  callbackUrl: string | null;
}) {
  const router = useRouter();
  const t = useDict().admin.settingsPayments;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mode, setMode] = useState<"sandbox" | "live">(settings.mode);
  const [merchantId, setMerchantId] = useState("");
  const [merchantPrivateKey, setMerchantPrivateKey] = useState("");
  const [nagadPublicKey, setNagadPublicKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("mode", mode);
    fd.set("merchantId", merchantId);
    fd.set("merchantPrivateKey", merchantPrivateKey);
    fd.set("nagadPublicKey", nagadPublicKey);
    startTransition(async () => {
      const result = await saveNagad(null, fd);
      if (!result.ok) setError(result.error ?? t.saveFailed);
      else {
        setSaved(true);
        setMerchantId("");
        setMerchantPrivateKey("");
        setNagadPublicKey("");
        router.refresh();
      }
    });
  }

  return (
    <ProviderCard
      icon={<ShieldIcon className="h-6 w-6" />}
      title={t.nagad.title}
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      mode={<ModeChip mode={mode} onChange={setMode} />}
      callback={
        <div className="space-y-1.5 rounded-md bg-surface-2 p-3">
          <CopyField label={t.nagad.callbackLabel} value={callbackUrl ?? ""} />
          {callbackUrl ? (
            <p className="text-2xs font-medium text-warning">
              {t.nagad.callbackWarning}
            </p>
          ) : (
            <p className="text-2xs font-medium text-ink-muted">
              {t.nagad.callbackHint}
            </p>
          )}
        </div>
      }
      test={<TestConnectionButton onTest={testNagad} disabled={!settings.configured} />}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <CredentialField id="ng-merchantId" label="merchant_id" value={merchantId} onChange={setMerchantId} hint={settings.merchantIdHint} />
      <CredentialField
        id="ng-privateKey"
        label="merchant_private_key (PEM)"
        value={merchantPrivateKey}
        onChange={setMerchantPrivateKey}
        multiline
        hint={settings.configured ? "••••" : null}
      />
      <CredentialField
        id="ng-publicKey"
        label="nagad_public_key (PEM)"
        value={nagadPublicKey}
        onChange={setNagadPublicKey}
        multiline
        hint={settings.configured ? "••••" : null}
      />
    </ProviderCard>
  );
}
