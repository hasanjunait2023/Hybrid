"use client";

// Steadfast courier settings form (DESIGN §P6). Enable toggle + masked Api-Key /
// Secret-Key. Secret fields are write-only (render empty; blank keeps the saved
// value). The honest "needs a real merchant account, no sandbox" note sets
// expectations — Steadfast has no test environment (brief §2).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, TruckIcon } from "@hybrid/ui";
import type { CourierSettings } from "@/lib/admin/settings";
import { saveSteadfast } from "./actions";

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 font-mono text-sm text-ink placeholder:text-ink-subtle focus-visible:border-primary";

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
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TruckIcon className="h-6 w-6 text-ink-muted" />
          <div>
            <h2 className="font-semibold text-ink">Steadfast</h2>
            <p className="text-xs text-ink-muted">
              {settings.configured ? "কনফিগার করা আছে" : "এখনো কনফিগার করা হয়নি"}
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-primary)]"
          />
          <span className="text-sm font-medium text-ink">{enabled ? "চালু" : "বন্ধ"}</span>
        </label>
      </div>

      <p className="rounded-md bg-warning-weak px-3 py-2 text-xs font-medium text-warning">
        ⚠ Steadfast-এর কোনো স্যান্ডবক্স নেই — লাইভ ডেলিভারির জন্য portal.steadfast.com.bd-এ আসল
        মার্চেন্ট অ্যাকাউন্ট লাগবে। অ্যাকাউন্ট না থাকলে কুরিয়ারে পাঠানো যাবে না।
      </p>

      <div className="grid gap-3">
        <div>
          <label htmlFor="apiKey" className="mb-1 block text-sm font-semibold text-ink">
            Api-Key
            {settings.apiKeyHint && (
              <span className="ml-2 font-mono text-2xs font-normal text-ink-subtle">
                {settings.apiKeyHint} সেভ করা আছে
              </span>
            )}
          </label>
          <input
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.apiKeyHint ? "অপরিবর্তিত রাখতে খালি রাখুন" : ""}
            autoComplete="off"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="secretKey" className="mb-1 block text-sm font-semibold text-ink">
            Secret-Key
          </label>
          <input
            id="secretKey"
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={settings.configured ? "অপরিবর্তিত রাখতে খালি রাখুন" : ""}
            autoComplete="off"
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
          সেভ হয়েছে।
        </p>
      )}

      <Button onClick={save} disabled={pending}>
        {pending ? "সেভ হচ্ছে…" : "সেভ করুন"}
      </Button>
    </section>
  );
}
