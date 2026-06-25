"use client";

// bKash provider config — refactored onto the shared <ProviderCard> (DESIGN §Q4).
// bKash uses a server-set callback (no paste needed), so the callback URL is
// shown read-only as reassurance, not a required step. The bKash row is the only
// admin place --color-bkash pink appears (ProviderCard accent="bkash"). Secret
// fields are write-only: empty render + "saved" hint; blank-keeps-saved.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ProviderCard,
  CredentialField,
  CopyField,
  TestConnectionButton,
  BkashIcon,
} from "@hybrid/ui";
import type { BkashSettings } from "@/lib/admin/settings";
import { useDict } from "@/lib/i18n/provider";
import { saveBkash } from "./actions";
import { testBkash } from "../test-connection/actions";
import { ModeChip } from "../ModeChip";

export function BkashForm({
  settings,
  callbackUrl,
}: {
  settings: BkashSettings;
  callbackUrl: string | null;
}) {
  const router = useRouter();
  const t = useDict().admin.settingsPayments;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mode, setMode] = useState<"sandbox" | "live">(settings.mode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("mode", mode);
    fd.set("username", username);
    fd.set("password", password);
    fd.set("appKey", appKey);
    fd.set("appSecret", appSecret);
    startTransition(async () => {
      const result = await saveBkash(null, fd);
      if (!result.ok) setError(result.error ?? t.saveFailed);
      else {
        setSaved(true);
        setUsername("");
        setPassword("");
        setAppKey("");
        setAppSecret("");
        router.refresh();
      }
    });
  }

  return (
    <ProviderCard
      icon={<BkashIcon className="h-6 w-6" />}
      title={t.bkash.title}
      accent="bkash"
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      mode={<ModeChip mode={mode} onChange={setMode} />}
      callback={
        callbackUrl && (
          <div className="space-y-1">
            <CopyField label={t.bkash.callbackLabel} value={callbackUrl} />
          </div>
        )
      }
      test={<TestConnectionButton onTest={testBkash} disabled={!settings.configured} />}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <CredentialField id="bk-username" label={t.bkash.username} value={username} onChange={setUsername} hint={settings.usernameHint} />
      <CredentialField id="bk-password" label={t.bkash.password} value={password} onChange={setPassword} type="password" />
      <CredentialField id="bk-appKey" label="app_key" value={appKey} onChange={setAppKey} hint={settings.appKeyHint} />
      <CredentialField id="bk-appSecret" label="app_secret" value={appSecret} onChange={setAppSecret} type="password" />
    </ProviderCard>
  );
}
