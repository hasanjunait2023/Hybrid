"use client";

// Compose + send an SMS broadcast (P2-4). Pick audience (live recipient count
// shown), write the message, create then send. Two-step (create → send) so the
// seller sees the recipient count before firing.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatNumber } from "@/lib/i18n/format";
import { createCampaignAction, sendCampaignAction } from "./actions";

type Audience = "all" | "repeat";

export function CampaignComposer({ allCount, repeatCount }: { allCount: number; repeatCount: number }) {
  const router = useRouter();
  const d = useDict();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [audience, setAudience] = useState<Audience>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const recipients = audience === "all" ? allCount : repeatCount;
  const remaining = 600 - message.length;

  const send = () => {
    setError(null);
    setNote(null);
    if (message.trim().length === 0) {
      setError(d.admin.marketing.composer.emptyMessage);
      return;
    }
    startTransition(async () => {
      const created = await createCampaignAction(message, audience);
      if (!created.ok || !created.id) {
        setError(created.error ?? d.admin.marketing.composer.createFailed);
        return;
      }
      const res = await sendCampaignAction(created.id);
      if (!res.ok) {
        setError(res.error ?? d.admin.marketing.composer.sendFailed);
        return;
      }
      const sentText = formatNumber(res.sent ?? 0, locale);
      setNote(
        res.live
          ? d.admin.marketing.composer.sentLive.replace("{count}", sentText)
          : d.admin.marketing.composer.sentRecorded.replace("{count}", sentText),
      );
      setMessage("");
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{d.admin.marketing.composer.recipientsLabel}</span>
        {([
          { v: "all", label: `${d.admin.marketing.composer.audienceAll} (${formatNumber(allCount, locale)})` },
          { v: "repeat", label: `${d.admin.marketing.composer.audienceRepeat} (${formatNumber(repeatCount, locale)})` },
        ] as const).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setAudience(o.v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              audience === o.v ? "bg-primary text-ink-on-primary" : "border border-border bg-surface text-ink-muted hover:bg-surface-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 600))}
        rows={3}
        placeholder={d.admin.marketing.composer.messagePlaceholder}
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <div className="flex items-center justify-between text-2xs text-ink-subtle">
        <span>{formatNumber(recipients, locale)} {d.admin.marketing.composer.recipientsSuffix}</span>
        <span className="tnum">{formatNumber(remaining, locale)} {d.admin.marketing.composer.charsRemainingSuffix}</span>
      </div>

      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
      {note && <p className="text-xs font-medium text-success">{note}</p>}

      <Button onClick={send} disabled={pending || recipients === 0}>
        {pending
          ? d.admin.marketing.composer.sending
          : `${d.admin.marketing.composer.sendButton} (${formatNumber(recipients, locale)})`}
      </Button>
    </section>
  );
}
