"use client";

// CRM task client islands — create form + per-row done/reopen/delete buttons.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Messages } from "@/lib/i18n/dictionaries";
import { createTaskAction, toggleTaskAction, deleteTaskAction } from "./actions";

type T = Messages["admin"]["tasks"];

export function CreateTaskForm({ t }: { t: T }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = await createTaskAction({
        title: fd.get("title"),
        note: fd.get("note") || "",
        priority: fd.get("priority") || "normal",
        dueAt: fd.get("dueAt") || "",
      });
      if (!res.ok) {
        setError(res.error ?? t.addFailed);
        return;
      }
      router.refresh();
      (document.getElementById("task-form") as HTMLFormElement | null)?.reset();
    });
  };

  return (
    <form
      id="task-form"
      action={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <label className="flex flex-1 flex-col gap-1" style={{ minWidth: 220 }}>
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.titleLabel}</span>
        <input
          name="title"
          required
          maxLength={200}
          placeholder={t.titlePlaceholder}
          className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.dueLabel}</span>
        <input
          name="dueAt"
          type="datetime-local"
          className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">{t.priorityLabel}</span>
        <select
          name="priority"
          defaultValue="normal"
          className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
        >
          <option value="low">{t.priority.low}</option>
          <option value="normal">{t.priority.normal}</option>
          <option value="high">{t.priority.high}</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? t.adding : t.add}
      </button>
      {error && <p className="w-full text-xs font-medium text-danger">{error}</p>}
    </form>
  );
}

export function TaskRowActions({ id, done, t }: { id: string; done: boolean; t: T }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const r = await toggleTaskAction(id, !done);
      if (r.ok) router.refresh();
    });
  const remove = () =>
    start(async () => {
      const r = await deleteTaskAction(id);
      if (r.ok) router.refresh();
    });

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className="text-2xs font-semibold text-primary hover:underline disabled:opacity-50"
      >
        {done ? t.reopen : t.markDone}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="text-2xs font-semibold text-danger hover:underline disabled:opacity-50"
      >
        {t.delete}
      </button>
    </span>
  );
}
