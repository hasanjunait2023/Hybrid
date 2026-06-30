"use client";

// O9 — Order tag chip group. The merchant toggles chips to add/remove
// tags (VIP / gift / fragile / birthday / etc.) on an individual order.
// Writes via setOrderTags server action; the parent refreshes router
// after a successful save.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrderTags } from "../tags-actions";

interface OrderTagChipsProps {
  orderId: string;
  initialTags: string[];
  vocabulary: string[];
}

export function OrderTagChips({
  orderId,
  initialTags,
  vocabulary,
}: OrderTagChipsProps) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (tag: string) => {
    if (pending) return;
    setError(null);
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    setTags(next);
    startTransition(async () => {
      const res = await setOrderTags(orderId, next);
      if (!res.ok) {
        setTags(tags); // revert
        setError(res.error ?? "failed");
        return;
      }
      setTags(res.tags ?? next);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {vocabulary.map((tag) => {
        const active = tags.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            disabled={pending}
            onClick={() => toggle(tag)}
            aria-pressed={active}
            className={
              "inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors disabled:opacity-60 " +
              (active
                ? "bg-primary text-white"
                : "bg-surface-2 text-ink-muted hover:bg-surface-3")
            }
          >
            {active ? "✓ " : ""}
            {tag}
          </button>
        );
      })}
      {error && <span className="ml-2 text-2xs text-error">{error}</span>}
    </div>
  );
}
