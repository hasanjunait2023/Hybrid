"use client";

// Customer notes + tags editor (DESIGN §P5). Posts updateCustomerNoteAndTags.
// Tags are comma-managed chips; risk tags render in danger-weak.
import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import { updateCustomerNoteAndTags } from "../actions";

export function CustomerNotes({
  customerId,
  initialNote,
  initialTags,
}: {
  customerId: string;
  initialNote: string;
  initialTags: string[];
}) {
  const [note, setNote] = useState(initialNote);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function addTag() {
    const t = draft.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setDraft("");
  }

  function save() {
    setSaved(false);
    const fd = new FormData();
    fd.set("customerId", customerId);
    fd.set("note", note);
    fd.set("tags", tags.join(","));
    startTransition(async () => {
      const result = await updateCustomerNoteAndTags(null, fd);
      if (result.ok) setSaved(true);
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-bold text-ink">নোট ও ট্যাগ</h2>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-muted"
          >
            {t}
            <button
              type="button"
              onClick={() => setTags(tags.filter((x) => x !== t))}
              aria-label={`${t} সরান`}
              className="text-ink-subtle hover:text-danger"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="ট্যাগ + Enter"
          className="h-8 w-32 rounded-sm border border-border-strong bg-surface px-2 text-sm text-ink"
        />
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="গ্রাহক সম্পর্কে নোট…"
        className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink focus-visible:border-primary"
      />

      <div className="flex items-center gap-3">
        <Button onClick={save} size="sm" disabled={pending}>
          {pending ? "সেভ হচ্ছে…" : "সেভ করুন"}
        </Button>
        {saved && <span className="text-xs font-medium text-success">সেভ হয়েছে।</span>}
      </div>
    </section>
  );
}
