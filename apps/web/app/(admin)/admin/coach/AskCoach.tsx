"use client";

// AI ask box (Phase R2.3). Calls the gated coach action; when the AI provider
// isn't configured the action returns { configured:false } and we show the
// fallback note pointing at the deterministic recommendations above.
import { useState, useTransition } from "react";
import type { Messages } from "@/lib/i18n/dictionaries";
import { askCoachAction } from "./actions";

type T = Messages["admin"]["coach"];

export function AskCoach({ t }: { t: T }) {
  const [pending, start] = useTransition();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const submit = () => {
    if (!question.trim()) return;
    setAnswer(null);
    setNote(null);
    start(async () => {
      const res = await askCoachAction(question);
      if (!res.configured) {
        setNote(t.aiDisabled);
        return;
      }
      if (res.answer) setAnswer(res.answer);
      else setNote(t.aiError);
    });
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h2 className="text-sm font-bold text-ink">{t.askHeading}</h2>
      <div className="mt-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          maxLength={1000}
          placeholder={t.askPlaceholder}
          className="h-10 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm"
        />
        <button
          type="button"
          disabled={pending || !question.trim()}
          onClick={submit}
          className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? t.asking : t.ask}
        </button>
      </div>
      {answer && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm text-ink">{answer}</p>
      )}
      {note && <p className="mt-3 text-xs text-ink-muted">{note}</p>}
    </section>
  );
}
