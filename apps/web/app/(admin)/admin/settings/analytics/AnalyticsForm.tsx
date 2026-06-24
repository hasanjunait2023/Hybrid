"use client";

// Analytics config (DESIGN §Q4) on the shared <ProviderCard>. GA4 + Meta
// Pixel/CAPI. Public IDs (Measurement ID, Pixel ID, Test Event Code) are plain
// fields shown in full; the two secrets (API Secret, Access Token) are masked
// write-only CredentialFields — blank on save keeps the sealed value.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard, CredentialField, ShieldIcon } from "@hybrid/ui";
import type { AnalyticsSettings } from "@/lib/admin/settings";
import { saveAnalytics } from "./actions";

export function AnalyticsForm({ settings }: { settings: AnalyticsSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [ga4MeasurementId, setGa4MeasurementId] = useState(settings.ga4MeasurementId);
  const [ga4ApiSecret, setGa4ApiSecret] = useState("");
  const [fbPixelId, setFbPixelId] = useState(settings.fbPixelId);
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [fbTestEventCode, setFbTestEventCode] = useState(settings.fbTestEventCode);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("ga4MeasurementId", ga4MeasurementId);
    fd.set("ga4ApiSecret", ga4ApiSecret);
    fd.set("fbPixelId", fbPixelId);
    fd.set("fbAccessToken", fbAccessToken);
    fd.set("fbTestEventCode", fbTestEventCode);
    startTransition(async () => {
      const result = await saveAnalytics(null, fd);
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        setGa4ApiSecret("");
        setFbAccessToken("");
        router.refresh();
      }
    });
  }

  const configured = settings.ga4Configured || settings.fbConfigured;

  return (
    <ProviderCard
      icon={<ShieldIcon className="h-6 w-6" />}
      title="অ্যানালিটিক্স (GA4 + Meta Pixel)"
      configured={configured}
      enabled={enabled}
      onEnabledChange={setEnabled}
      onSave={save}
      saving={pending}
      error={error}
      saved={saved}
    >
      <p className="text-2xs font-medium text-ink-muted">
        Google Analytics 4 ও Meta (Facebook) Pixel/Conversions API যুক্ত করুন। অর্ডার সম্পন্ন হলে
        Purchase ইভেন্ট একবারই গণনা হয় (ডুপ্লিকেট বাদ)।
      </p>

      <CredentialField
        id="an-ga4-id"
        label="GA4 Measurement ID (G-XXXXXXXXXX)"
        value={ga4MeasurementId}
        onChange={setGa4MeasurementId}
      />
      <CredentialField
        id="an-ga4-secret"
        label="GA4 API Secret"
        value={ga4ApiSecret}
        onChange={setGa4ApiSecret}
        hint={settings.ga4ApiSecretHint}
      />
      <CredentialField
        id="an-fb-pixel"
        label="Meta Pixel ID"
        value={fbPixelId}
        onChange={setFbPixelId}
      />
      <CredentialField
        id="an-fb-token"
        label="Meta CAPI Access Token"
        value={fbAccessToken}
        onChange={setFbAccessToken}
        hint={settings.fbAccessTokenHint}
        multiline
      />
      <CredentialField
        id="an-fb-test"
        label="Meta Test Event Code (ঐচ্ছিক)"
        value={fbTestEventCode}
        onChange={setFbTestEventCode}
      />
    </ProviderCard>
  );
}
