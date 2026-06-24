"use client";

// Tenant WhatsApp config (blueprint 2.8 S-WHATSAPP; DESIGN §Q4). The seller
// pastes its OWN WhatsApp Cloud API credentials (manual entry in Phase 2;
// Embedded Signup is Phase 3). accessToken is sealed; WhatsApp is ADDITIVE to
// SMS and per-tenant opt-in. The Bengali order-confirmation Utility template
// must be approved by Meta (founder action) before live sends work.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, ChatIcon } from "@hybrid/ui";
import type { WhatsAppSettings } from "@/lib/admin/settings";
import { saveWhatsApp } from "./actions";

export function WhatsAppForm({ settings }: { settings: WhatsAppSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("wabaId", wabaId);
    fd.set("phoneNumberId", phoneNumberId);
    fd.set("accessToken", accessToken);
    startTransition(async () => {
      const result = await saveWhatsApp(null, fd);
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        setAccessToken("");
        router.refresh();
      }
    });
  }

  return (
    <ProviderCard
      icon={<ChatIcon className="h-6 w-6" />}
      title="WhatsApp (Cloud API)"
      configured={settings.configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <p className="rounded-md bg-warning-weak px-3 py-2 text-xs font-medium text-warning">
        ⚠ অর্ডার কনফার্মেশনের বাংলা টেমপ্লেটটি Meta-তে অনুমোদিত হতে হবে (Utility
        template)। অনুমোদন না হওয়া পর্যন্ত মেসেজ পাঠানো যাবে না।
      </p>
      <CredentialField
        id="whatsapp-wabaId"
        label="WABA ID"
        value={wabaId}
        onChange={setWabaId}
        hint={settings.wabaIdHint}
      />
      <CredentialField
        id="whatsapp-phoneNumberId"
        label="ফোন নম্বর ID"
        value={phoneNumberId}
        onChange={setPhoneNumberId}
        hint={settings.phoneNumberIdHint}
      />
      <CredentialField
        id="whatsapp-accessToken"
        label="অ্যাক্সেস টোকেন"
        value={accessToken}
        onChange={setAccessToken}
        hint={settings.configured ? "••••" : null}
        type="password"
      />
    </ProviderCard>
  );
}
