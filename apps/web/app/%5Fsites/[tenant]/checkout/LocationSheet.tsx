"use client";
// Cascading location picker as a bottom sheet (DESIGN P1.3). Each level
// (Division → District → Thana) is a searchable bottom sheet — NOT a native
// <select> — with a Bangla filter at top (64 districts is too many to scroll
// blind). Filter matches Bangla title AND the English transliteration. Stores
// the canonical Bangla title (courier reads Bangla addresses).
import { useMemo, useState } from "react";
import type { CascadeOption } from "@/lib/location";
import { useDict, useLocale } from "@/lib/i18n/provider";
import { formatNumber } from "@/lib/i18n/format";

interface LocationSheetProps {
  label: string;
  /** Selected Bangla title, or null when unset. */
  value: string | null;
  options: CascadeOption[];
  disabled?: boolean;
  placeholder: string;
  /** Count noun, e.g. "জেলা" → "৬৪টি জেলা". */
  countNoun: string;
  onSelect: (option: CascadeOption) => void;
}

export function LocationSheet({
  label,
  value,
  options,
  disabled = false,
  placeholder,
  countNoun,
  onSelect,
}: LocationSheetProps) {
  const d = useDict();
  const locale = useLocale();
  const t = d.storefront.checkout;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.bn.includes(filter.trim()) || o.en.toLowerCase().includes(q),
    );
  }, [filter, options]);

  function choose(option: CascadeOption) {
    onSelect(option);
    setOpen(false);
    setFilter("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="bn-body text-sm font-semibold text-ink">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={[
          "flex h-11 items-center justify-between rounded-sm border bg-surface px-3 text-left text-sm transition-colors",
          disabled
            ? "cursor-not-allowed border-border bg-surface-2 text-ink-subtle"
            : "border-border-strong text-ink",
        ].join(" ")}
      >
        <span className={value ? "text-ink" : "text-ink-subtle"}>
          {value ?? placeholder}
        </span>
        <span aria-hidden className="text-ink-subtle">▾</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-modal flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <button
            type="button"
            aria-label={t.close}
            className="absolute inset-0 z-overlay bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-modal max-h-[75vh] overflow-hidden rounded-t-lg bg-surface">
            <div className="flex flex-col gap-2 border-b border-border p-4">
              <div className="flex items-center justify-between">
                <span className="bn-body text-base font-bold text-ink">{label}</span>
                <span className="text-2xs text-ink-muted">
                  {`${formatNumber(options.length, locale)}${t.countSuffix} ${countNoun}`}
                </span>
              </div>
              <input
                type="text"
                autoFocus
                inputMode="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle"
              />
            </div>

            <ul className="max-h-[55vh] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <li className="bn-body p-4 text-center text-sm text-ink-muted">
                  {t.noResults}
                </li>
              )}
              {filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => choose(option)}
                    className={[
                      "flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm transition-colors",
                      option.bn === value
                        ? "bg-primary-weak font-semibold text-primary"
                        : "text-ink hover:bg-surface-2",
                    ].join(" ")}
                  >
                    {option.bn}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
