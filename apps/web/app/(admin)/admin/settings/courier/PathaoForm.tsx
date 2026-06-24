"use client";

// Pathao courier config (DESIGN §Q4). OAuth2 {client_id, client_secret,
// username, password}; the bearer token is adapter-managed in Redis (transparent
// to the seller). Stage vs live mode. Test Connection forces the OAuth2 grant +
// balance — proof the creds work. Geography defaults (city/zone/area) are set in
// a later slice (S-PATHAO-WIRE owns the dropdowns); this card configures auth.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, TestConnectionButton, TruckIcon } from "@hybrid/ui";
import type { PathaoSettings } from "@/lib/admin/settings";
import { savePathao } from "./actions";
import { testPathao } from "../test-connection/actions";
import { ModeChip } from "../ModeChip";

export function PathaoForm({ settings }: { settings: PathaoSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mode, setMode] = useState<"stage" | "live">(settings.mode);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("mode", mode);
    fd.set("clientId", clientId);
    fd.set("clientSecret", clientSecret);
    fd.set("username", username);
    fd.set("password", password);
    startTransition(async () => {
      const result = await savePathao(null, fd);
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        setClientId("");
        setClientSecret("");
        setUsername("");
        setPassword("");
        router.refresh();
      }
    });
  }

  return (
    <ProviderCard
      icon={<TruckIcon className="h-6 w-6" />}
      title="Pathao"
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      mode={<ModeChip mode={mode} onChange={setMode} testValue="stage" />}
      test={<TestConnectionButton onTest={testPathao} disabled={!settings.configured} />}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <CredentialField id="pt-clientId" label="client_id" value={clientId} onChange={setClientId} hint={settings.clientIdHint} />
      <CredentialField id="pt-clientSecret" label="client_secret" value={clientSecret} onChange={setClientSecret} type="password" hint={settings.configured ? "••••" : null} />
      <CredentialField id="pt-username" label="username" value={username} onChange={setUsername} />
      <CredentialField id="pt-password" label="password" value={password} onChange={setPassword} type="password" />
    </ProviderCard>
  );
}
