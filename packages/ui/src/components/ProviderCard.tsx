"use client";

// ProviderCard — the single integration-config anatomy reused for EVERY provider
// (DESIGN §Q4): bKash / Nagad / SSLCommerz / Steadfast / Pathao / RedX / Paperfly
// / SMS / WhatsApp / analytics all look and behave identically. Learn it once,
// configure any. Fixed top→bottom order:
//
//   1. Header row: glyph + name + configured hint + ToggleSwitch (enable)
//   2. Mode/sandbox chip            (optional slot: `mode`)
//   3. Credential fields            (slot: `children`)
//   4. Callback / IPN URL row       (optional slot: `callback` — CopyField)
//   5. Test Connection              (optional slot: `test` — TestConnectionButton)
//   6. Save bar                     (dirty-only save button + saved/error strips)
//
// Provider-specific concerns (which fields, which mode chip, whether a callback
// URL is shown) are passed in as slots so the card stays generic. The card owns
// the chrome that must be identical across all ten providers.
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./Button";
import { ToggleSwitch } from "./ToggleSwitch";

type ToggleAccent = "primary" | "bkash";

type Props = {
  /** Provider glyph (e.g. <BkashIcon />, <TruckIcon />). */
  icon: ReactNode;
  /** Provider name (e.g. "বিকাশ", "Pathao"). */
  title: string;
  /** Renders the "কনফিগার করা আছে" / "এখনো হয়নি" hint under the title. */
  configured: boolean;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  /** bKash uses `bkash` pink for its toggle+glyph; everyone else `primary`. */
  accent?: ToggleAccent;
  /** When set, the toggle is disabled and a "শীঘ্রই আসছে" banner shows (RedX/Paperfly). */
  comingSoon?: boolean;

  /** Slot 2 — optional sandbox/live mode chip + its warning. */
  mode?: ReactNode;
  /** Slot 3 — masked credential fields. */
  children?: ReactNode;
  /** Slot 4 — callback/IPN URL CopyField (Nagad/SSLCommerz require; bKash reassures). */
  callback?: ReactNode;
  /** Slot 5 — TestConnectionButton. */
  test?: ReactNode;

  /** Save bar. Omit `onSave` to render a card with no save action (e.g. info-only). */
  onSave?: () => void;
  saving?: boolean;
  dirty?: boolean;
  error?: string | null;
  saved?: boolean;
};

export function ProviderCard({
  icon,
  title,
  configured,
  enabled,
  onEnabledChange,
  accent = "primary",
  comingSoon = false,
  mode,
  children,
  callback,
  test,
  onSave,
  saving = false,
  dirty = true,
  error,
  saved = false,
}: Props) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      {/* 1. Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-6 w-6", accent === "bkash" ? "text-bkash" : "text-ink-muted")}>
            {icon}
          </span>
          <div>
            <h2 className="font-semibold text-ink">{title}</h2>
            <p className="text-xs text-ink-muted">
              {comingSoon
                ? "শীঘ্রই আসছে"
                : configured
                  ? "কনফিগার করা আছে"
                  : "এখনো কনফিগার করা হয়নি"}
            </p>
          </div>
        </div>
        <ToggleSwitch
          checked={enabled}
          onChange={onEnabledChange}
          label={`${title} চালু/বন্ধ`}
          accent={accent}
          disabled={comingSoon}
        />
      </div>

      {comingSoon ? (
        <p className="rounded-md bg-warning-weak px-3 py-2 text-xs font-medium text-warning">
          ⚠ এই কুরিয়ারটি শীঘ্রই যুক্ত হবে। এখনো কনফিগার করা যাবে না।
        </p>
      ) : (
        <>
          {/* 2. Mode/sandbox chip */}
          {mode}

          {/* 3. Credential fields */}
          {children && <div className="grid gap-3">{children}</div>}

          {/* 4. Callback / IPN URL */}
          {callback}

          {/* 5. Test Connection */}
          {test}

          {/* 6. Save bar */}
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
          {onSave && (
            <Button type="button" onClick={onSave} disabled={saving || !dirty}>
              {saving ? "সেভ হচ্ছে…" : "সেভ করুন"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

// CredentialField — the masked, write-only field every ProviderCard reuses
// (DESIGN §Q4.1 step 3). Renders EMPTY with a "•••• সেভ করা আছে" hint when a
// value is already sealed; a blank field on save keeps the prior secret.
type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Masked tail of the saved value (e.g. "••••3d9l"); null when unset. */
  hint?: string | null;
  type?: "text" | "password";
  /** Multi-line (Nagad merchant_private_key PEM). */
  multiline?: boolean;
};

const fieldCls =
  "w-full rounded-sm border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-subtle focus-visible:border-primary focus-visible:outline-none";

export function CredentialField({
  id,
  label,
  value,
  onChange,
  hint,
  type = "text",
  multiline = false,
}: FieldProps) {
  const placeholder = hint ? "অপরিবর্তিত রাখতে খালি রাখুন" : "";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
        {hint && (
          <span className="ml-2 font-mono text-2xs font-normal text-ink-subtle">{hint} সেভ করা আছে</span>
        )}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          rows={4}
          className={cn(fieldCls, "resize-y")}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(fieldCls, "h-11")}
        />
      )}
    </div>
  );
}
