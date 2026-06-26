"use client";

// Order notes + assignment panel — internal team collaboration. Notes are
// tenant-wide (all staff see them); assignments route the order to a
// specific member. Uses Server Actions from ./notes-actions.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addOrderNote, assignOrder } from "./notes-actions";

export interface Member {
  id: string;
  fullName: string | null;
  email: string;
  role: "owner" | "admin" | "staff";
}

export interface ExistingNote {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export function OrderNotesPanel({
  orderId,
  notes: initialNotes,
  members,
  currentAssigneeId,
  canManage,
}: {
  orderId: string;
  notes: ExistingNote[];
  members: Member[];
  currentAssigneeId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState<string | null>(currentAssigneeId);
  const [assignPending, startAssignTransition] = useTransition();

  const submit = () => {
    if (!body.trim()) {
      setError("নোট লিখুন।");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addOrderNote(orderId, body.trim());
      if (!res.ok) {
        setError(res.error ?? "ব্যর্থ");
        return;
      }
      setBody("");
      // Optimistic — append placeholder, refresh server data
      setNotes((prev) => [
        {
          id: res.id ?? `tmp-${Date.now()}`,
          body: body.trim(),
          authorName: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      router.refresh();
    });
  };

  const onAssign = (userId: string) => {
    const next = userId === "" ? null : userId;
    setAssignee(next);
    startAssignTransition(async () => {
      const res = await assignOrder(orderId, next);
      if (!res.ok) {
        setAssignee(currentAssigneeId);
        setError(res.error ?? "ব্যর্থ");
      }
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        অর্ডার নোট ও দায়িত্ব
      </h3>

      {/* Assignment selector */}
      {canManage && members.length > 0 && (
        <div className="mt-3">
          <label
            htmlFor="assignee-select"
            className="block text-2xs font-semibold text-ink-muted"
          >
            দায়িত্বে আছেন
          </label>
          <select
            id="assignee-select"
            value={assignee ?? ""}
            onChange={(e) => onAssign(e.target.value)}
            disabled={assignPending}
            className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            <option value="">অদায়িত (কেউ না)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName ?? m.email} · {m.role}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Existing notes list */}
      {notes.length > 0 && (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md bg-surface-2 px-3 py-2">
              <p className="text-sm text-ink">{n.body}</p>
              <p className="mt-1 text-2xs text-ink-subtle">
                {n.authorName ?? "Unknown"} ·{" "}
                {new Date(n.createdAt).toLocaleString("en-GB", {
                  timeZone: "Asia/Dhaka",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* New note form */}
      <div className="mt-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="ইন্টারনাল নোট যোগ করুন (শুধু টিম দেখবে)…"
          className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle"
        />
        {error && (
          <p className="text-2xs font-semibold text-danger">{error}</p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !body.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "পাঠাচ্ছি…" : "নোট যোগ করুন"}
          </button>
        </div>
      </div>
    </section>
  );
}