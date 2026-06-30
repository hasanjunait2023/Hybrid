"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectIntegrationAction, testConnectionAction } from "./actions";
import type { IntegrationPlatform } from "@/lib/integrations/types";

const PLATFORMS: { id: IntegrationPlatform; label: string; icon: string; desc: string }[] = [
  { id: "shopify", label: "Shopify", icon: "🛍️", desc: "Shopify Admin API দিয়ে সংযুক্ত করুন" },
  { id: "woocommerce", label: "WooCommerce", icon: "🛒", desc: "WooCommerce REST API v3" },
  { id: "custom_api", label: "কাস্টম API", icon: "⚡", desc: "যেকোনো REST API এন্ডপয়েন্ট" },
  { id: "webhook_only", label: "Webhook Only", icon: "🔔", desc: "শুধু ইনকামিং ইভেন্ট গ্রহণ" },
];

export function ConnectWizard() {
  const router = useRouter();
  const [step, setStep] = useState<"pick" | "creds" | "done">("pick");
  const [platform, setPlatform] = useState<IntegrationPlatform | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testError, setTestError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isPending, startTransition] = useTransition();

  function pickPlatform(p: IntegrationPlatform) {
    setPlatform(p);
    setStep("creds");
    setTestStatus("idle");
    setTestError("");
    setSaveError("");
  }

  async function handleTest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setTestStatus("testing");
    setTestError("");
    const result = await testConnectionAction(fd);
    if (result.ok) {
      setTestStatus("ok");
    } else {
      setTestStatus("fail");
      setTestError(result.error ?? "সংযোগ ব্যর্থ");
    }
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaveError("");
    startTransition(async () => {
      const result = await connectIntegrationAction(fd);
      if (result.ok && result.integrationId) {
        setStep("done");
        setTimeout(() => router.push(`/admin/integrations/${result.integrationId}`), 1200);
      } else {
        setSaveError(result.error ?? "সংরক্ষণ ব্যর্থ");
      }
    });
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="text-5xl">✅</span>
        <p className="text-lg font-semibold text-ink">ইন্টিগ্রেশন সফল!</p>
        <p className="text-sm text-ink-muted">সিঙ্ক ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে…</p>
      </div>
    );
  }

  if (step === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">কোন প্ল্যাটফর্মের সাথে সংযুক্ত করতে চান?</p>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pickPlatform(p.id)}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <span className="text-2xl">{p.icon}</span>
            <div>
              <p className="font-semibold text-ink">{p.label}</p>
              <p className="text-xs text-ink-muted">{p.desc}</p>
            </div>
          </button>
        ))}
      </div>
    );
  }

  // step === "creds"
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setStep("pick")}
        className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        ← ফিরে যান
      </button>

      <h2 className="font-semibold text-ink">
        {PLATFORMS.find((p) => p.id === platform)?.icon}{" "}
        {PLATFORMS.find((p) => p.id === platform)?.label} সংযোগ
      </h2>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <input type="hidden" name="platform" value={platform ?? ""} />

        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          নাম (ঐচ্ছিক)
          <input
            name="display_name"
            placeholder="আমার শপিফাই স্টোর"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        {platform === "shopify" && <ShopifyFields />}
        {platform === "woocommerce" && <WooFields />}
        {platform === "custom_api" && <CustomFields />}
        {platform === "webhook_only" && <WebhookOnlyFields />}

        {testStatus === "ok" && (
          <p className="text-sm text-success font-medium">✅ সংযোগ সফল!</p>
        )}
        {testStatus === "fail" && (
          <p className="text-sm text-error">{testError}</p>
        )}
        {saveError && <p className="text-sm text-error">{saveError}</p>}

        <div className="flex gap-2">
          <TestButton platform={platform} onTest={handleTest} testStatus={testStatus} />
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ ও সক্রিয় করুন"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TestButton({
  platform,
  onTest,
  testStatus,
}: {
  platform: IntegrationPlatform | null;
  onTest: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  testStatus: string;
}) {
  if (platform === "webhook_only") return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
        onTest({ currentTarget: form, preventDefault: () => {} } as React.FormEvent<HTMLFormElement>);
      }}
      disabled={testStatus === "testing"}
      className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
    >
      {testStatus === "testing" ? "পরীক্ষা হচ্ছে…" : "সংযোগ পরীক্ষা"}
    </button>
  );
}

function Field({ name, label, placeholder, type = "text", required = false }: {
  name: string; label: string; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      {label}{required && <span className="text-error">*</span>}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="rounded-md border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

function ShopifyFields() {
  return (
    <>
      <Field name="shop_url" label="Shop URL" placeholder="mystore.myshopify.com" required />
      <Field name="access_token" label="Admin API Access Token" type="password" placeholder="shpat_..." required />
    </>
  );
}

function WooFields() {
  return (
    <>
      <Field name="site_url" label="সাইট URL" placeholder="https://mystore.com" required />
      <Field name="consumer_key" label="Consumer Key" placeholder="ck_..." required />
      <Field name="consumer_secret" label="Consumer Secret" type="password" placeholder="cs_..." required />
    </>
  );
}

function CustomFields() {
  const [authType, setAuthType] = useState<"bearer" | "basic" | "api_key" | "none">("none");
  return (
    <>
      <Field name="base_url" label="Base URL" placeholder="https://api.mystore.com" required />
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
        Auth টাইপ
        <select
          name="auth_type"
          value={authType}
          onChange={(e) => setAuthType(e.target.value as typeof authType)}
          className="rounded-md border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="api_key">API Key Header</option>
        </select>
      </label>
      {authType === "bearer" && <Field name="token" label="Token" type="password" required />}
      {authType === "basic" && (
        <>
          <Field name="username" label="Username" required />
          <Field name="password" label="Password" type="password" required />
        </>
      )}
      {authType === "api_key" && (
        <>
          <Field name="api_key_header" label="Header Name" placeholder="X-API-Key" required />
          <Field name="api_key_value" label="Header Value" type="password" required />
        </>
      )}
      <p className="text-xs font-semibold text-ink-muted mt-2">এন্ডপয়েন্ট (ঐচ্ছিক)</p>
      <Field name="ep_products" label="Products Path" placeholder="/api/products" />
      <Field name="ep_inventory" label="Inventory Path" placeholder="/api/inventory" />
      <Field name="ep_orders" label="Orders Path" placeholder="/api/orders" />
    </>
  );
}

function WebhookOnlyFields() {
  return (
    <Field
      name="incoming_secret"
      label="HMAC Secret (ঐচ্ছিক)"
      type="password"
      placeholder="ওয়েবহুক স্বাক্ষর যাচাই করতে"
    />
  );
}
