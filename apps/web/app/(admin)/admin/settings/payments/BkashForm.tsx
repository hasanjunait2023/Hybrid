"use client";

// bKash settings form (DESIGN §P6). Enable toggle + masked credential fields +
// a sandbox/live mode switch with a warning chip in sandbox. The bKash row is
// the only admin place --color-bkash pink appears. Secret fields are write-only:
// they render EMPTY (never the saved value) with a "saved" hint when configured;
// leaving a field blank keeps the previously-sealed value server-side.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, BkashIcon } from "@hybrid/ui";
import type { BkashSettings } from "@/lib/admin/settings";
import { saveBkash } from "./actions";

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 font-mono text-sm text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function BkashForm({ settings }: { settings: BkashSettings }) {
  const router = useRouter();
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
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        // Clear the secret fields after a successful save (never re-render them).
        setUsername("");
        setPassword("");
        setAppKey("");
        setAppSecret("");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BkashIcon className="h-6 w-6 text-bkash" />
          <div>
            <h2 className="font-semibold text-ink">বিকাশ</h2>
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
            className="h-5 w-5 accent-[var(--color-bkash)]"
          />
          <span className="text-sm font-medium text-ink">{enabled ? "চালু" : "বন্ধ"}</span>
        </label>
      </div>

      {/* Mode switch + sandbox warning */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink">মোড</label>
        <div className="flex gap-2">
          {(["sandbox", "live"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "rounded-md border-2 border-primary bg-primary-weak px-3 py-1.5 text-sm font-semibold text-primary"
                  : "rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-2"
              }
            >
              {m === "sandbox" ? "স্যান্ডবক্স" : "লাইভ"}
            </button>
          ))}
        </div>
        {mode === "sandbox" && (
          <p className="rounded-md bg-warning-weak px-3 py-2 text-xs font-medium text-warning">
            ⚠ স্যান্ডবক্স মোড — পরীক্ষার জন্য। আসল পেমেন্টের জন্য লাইভ মোডে আসল মার্চেন্ট তথ্য দিন।
          </p>
        )}
      </div>

      {/* Credentials — write-only, masked hints for what's already saved */}
      <div className="grid gap-3">
        <Field
          id="username"
          label="ইউজারনেম"
          value={username}
          onChange={setUsername}
          hint={settings.usernameHint}
        />
        <Field id="password" label="পাসওয়ার্ড" value={password} onChange={setPassword} type="password" />
        <Field id="appKey" label="app_key" value={appKey} onChange={setAppKey} hint={settings.appKeyHint} />
        <Field
          id="appSecret"
          label="app_secret"
          value={appSecret}
          onChange={setAppSecret}
          type="password"
        />
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

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string | null;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
        {hint && <span className="ml-2 font-mono text-2xs font-normal text-ink-subtle">{hint} সেভ করা আছে</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint ? "অপরিবর্তিত রাখতে খালি রাখুন" : ""}
        autoComplete="off"
        className={inputCls}
      />
    </div>
  );
}
