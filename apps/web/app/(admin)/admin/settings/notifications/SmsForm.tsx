"use client";

// Tenant SMS config (DESIGN §Q4). The seller pastes its own sms.net.bd api_key
// for customer order notifications; the platform key stays for signup OTP. The
// api_key is sealed; senderId is a non-secret label.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, ChatIcon } from "@hybrid/ui";
import type { SmsSettings } from "@/lib/admin/settings";
import { saveSms } from "./actions";

export function SmsForm({ settings }: { settings: SmsSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [apiKey, setApiKey] = useState("");
  const [senderId, setSenderId] = useState(settings.senderId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("apiKey", apiKey);
    fd.set("senderId", senderId);
    startTransition(async () => {
      const result = await saveSms(null, fd);
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
      icon={<ChatIcon className="h-6 w-6" />}
      title="SMS (sms.net.bd)"
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <CredentialField id="sms-apiKey" label="api_key" value={apiKey} onChange={setApiKey} hint={settings.apiKeyHint} />
      <CredentialField id="sms-senderId" label="sender_id (ঐচ্ছিক)" value={senderId} onChange={setSenderId} />
    </ProviderCard>
  );
}
