"use client";

// Customer segment create form + delete button (client islands).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSegmentAction, deleteSegmentAction } from "./actions";

export function CreateSegmentForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = await createSegmentAction({
        name: fd.get("name"),
        minOrders: fd.get("minOrders") || 0,
        minSpent: fd.get("minSpent") || 0,
        tag: fd.get("tag") || "",
      });
      if (!res.ok) {
        setError(res.error ?? "তৈরি করা যায়নি।");
        return;
      }
      router.refresh();
      (document.getElementById("seg-form") as HTMLFormElement | null)?.reset();
    });
  };

  return (
    <form
      id="seg-form"
      action={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">নাম</span>
        <input
          name="name"
          required
          placeholder="রিপিট কাস্টমার"
          className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">ন্যূনতম অর্ডার</span>
        <input
          name="minOrders"
          type="number"
          min={0}
          defaultValue={0}
          className="h-9 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">ন্যূনতম খরচ (৳)</span>
        <input
          name="minSpent"
          type="number"
          min={0}
          defaultValue={0}
          className="h-9 w-28 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm tnum"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase text-ink-muted">ট্যাগ (ঐচ্ছিক)</span>
        <input
          name="tag"
          className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "…" : "তৈরি করুন"}
      </button>
      {error && <p className="w-full text-xs font-medium text-danger">{error}</p>}
    </form>
  );
}

export function DeleteSegment({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await deleteSegmentAction(id);
          if (r.ok) router.refresh();
        })
      }
      className="text-2xs font-semibold text-danger hover:underline disabled:opacity-50"
    >
      মুছুন
    </button>
  );
}
