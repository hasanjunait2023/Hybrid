"use client";

// Division → District → Thana cascade picker (DESIGN §P1.3 / §P3.4). Each level
// is a searchable bottom-sheet (mobile ergonomics) with a Bangla/Latin filter —
// 64 districts is too many to scroll blind. Operator-tuned: the sheet opens with
// the filter focused (keyboard-default). Stores the Bangla title; matches filter
// against Bangla + English transliteration.
import { useMemo, useRef, useState } from "react";
import type { CascadeOption, LocationTree } from "@/lib/location";
import { useDict, useLocale } from "@/lib/i18n/provider";

export interface LocationValue {
  division: string;
  district: string;
  thana: string;
  divisionValue: number | null;
  districtValue: number | null;
}

interface Props {
  tree: LocationTree;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
}

export function LocationPicker({ tree, value, onChange }: Props) {
  const d = useDict();
  const loc = d.admin.orders.location;
  const districts = value.divisionValue != null
    ? (tree.districtsByDivision[value.divisionValue] ?? [])
    : [];
  const thanas = value.districtValue != null
    ? (tree.thanasByDistrict[value.districtValue] ?? [])
    : [];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <SelectSheet
        label={loc.division}
        options={tree.divisions}
        selectedLabel={value.division}
        onSelect={(opt) =>
          onChange({
            division: opt.bn,
            divisionValue: opt.value,
            district: "",
            districtValue: null,
            thana: "",
          })
        }
      />
      <SelectSheet
        label={loc.district}
        options={districts}
        selectedLabel={value.district}
        disabled={value.divisionValue == null}
        onSelect={(opt) =>
          onChange({
            ...value,
            district: opt.bn,
            districtValue: opt.value,
            thana: "",
          })
        }
      />
      <SelectSheet
        label={loc.thana}
        options={thanas}
        selectedLabel={value.thana}
        disabled={value.districtValue == null}
        onSelect={(opt) => onChange({ ...value, thana: opt.bn })}
      />
    </div>
  );
}

function SelectSheet({
  label,
  options,
  selectedLabel,
  disabled = false,
  onSelect,
}: {
  label: string;
  options: CascadeOption[];
  selectedLabel: string;
  disabled?: boolean;
  onSelect: (opt: CascadeOption) => void;
}) {
  const d = useDict();
  const locale = useLocale();
  const loc = d.admin.orders.location;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.bn.toLowerCase().includes(q) || o.en.toLowerCase().includes(q),
    );
  }, [options, filter]);

  function openSheet() {
    if (disabled) return;
    setOpen(true);
    setFilter("");
    // Focus the filter input on the next tick (sheet mounts first).
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-ink">{label}</label>
      <button
        type="button"
        onClick={openSheet}
        disabled={disabled}
        className="flex h-11 w-full items-center justify-between rounded-sm border border-border-strong bg-surface px-3 text-left text-base text-ink disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle"
      >
        <span className={selectedLabel ? "text-ink" : "text-ink-subtle"}>
          {selectedLabel || loc.select}
        </span>
        <span aria-hidden className="text-ink-subtle">▾</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center">
          {/* backdrop */}
          <button
            type="button"
            aria-label={loc.close}
            className="absolute inset-0 z-overlay bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-modal flex max-h-[70vh] w-full max-w-md flex-col rounded-t-lg bg-surface sm:rounded-lg">
            <div className="border-b border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-ink">{label} {loc.selectSuffix}</span>
                <span className="text-2xs text-ink-subtle tnum">{options.length}{loc.countSuffix}</span>
              </div>
              <input
                ref={inputRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={loc.searchPlaceholder}
                className="h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary"
              />
            </div>
            <ul className="overflow-y-auto">
              {filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(opt);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-base text-ink hover:bg-surface-2"
                  >
                    <span>{locale === "bn" ? opt.bn : opt.en}</span>
                    <span className="text-xs text-ink-subtle">{locale === "bn" ? opt.en : opt.bn}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-ink-muted">{loc.nothingFound}</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
