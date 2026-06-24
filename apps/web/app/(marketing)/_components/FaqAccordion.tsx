"use client";

import { useId, useState } from "react";
import type { FaqItem } from "../../../lib/i18n/marketing";

interface FaqAccordionProps {
  items: FaqItem[];
}

// Accessible disclosure accordion. Each row is a real <button> controlling a
// region via aria-expanded / aria-controls; multiple panels may stay open. The
// chevron is decorative. Keyboard works natively (button + Enter/Space).
export function FaqAccordion({ items }: FaqAccordionProps) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const baseId = useId();

  function toggle(index: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        const panelId = `${baseId}-panel-${i}`;
        const btnId = `${baseId}-btn-${i}`;
        return (
          <div key={item.q}>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left text-lg font-semibold text-ink transition-colors duration-fast ease-out-soft hover:text-primary"
              >
                <span>{item.q}</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className={`h-5 w-5 flex-shrink-0 text-ink-subtle transition-transform duration-base ease-out-soft ${
                    isOpen ? "rotate-180" : ""
                  }`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!isOpen}
              className="bn-body px-5 pb-5 text-base text-ink-muted"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
