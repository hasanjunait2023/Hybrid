"use client";

// CopyField — read-only mono value + copy-to-clipboard with a 1.5s confirm
// (DESIGN §Q4/§Q5/§P6). LOAD-BEARING: Nagad/SSLCommerz IPN URLs, custom-domain
// DNS records, and the live subdomain all require error-free copy or the
// integration silently breaks — one accessible, keyboard-operable primitive
// beats five hand-rolled ones. Value is rendered verbatim; never user-evaluated.
import { useState } from "react";
import { cn } from "../lib/cn";

type Props = {
  value: string;
  /** Optional label rendered above the value. */
  label?: string;
  /** Small record-type / host chip shown to the left of the value (DNS rows). */
  chip?: string;
};

export function CopyField({ value, label, chip }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API can reject (insecure context / permissions). Fall back to
      // a transient textarea selection so the value is still selectable by hand.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* user can still copy manually from the selection */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1">
      {label && <span className="block text-xs font-semibold text-ink-muted">{label}</span>}
      <div className="flex items-stretch gap-2">
        {chip && (
          <span className="inline-flex shrink-0 items-center rounded-sm bg-surface-2 px-2 font-mono text-2xs font-semibold uppercase text-ink-muted">
            {chip}
          </span>
        )}
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-sm border border-border-strong bg-surface-2 px-3 py-2 font-mono text-sm text-ink">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "কপি হয়েছে" : "কপি করুন"}
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-sm border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            copied
              ? "border-success bg-success-weak text-success"
              : "border-border-strong bg-surface text-ink hover:bg-surface-2",
          )}
        >
          {copied ? "কপি হয়েছে ✓" : "কপি"}
        </button>
      </div>
    </div>
  );
}
