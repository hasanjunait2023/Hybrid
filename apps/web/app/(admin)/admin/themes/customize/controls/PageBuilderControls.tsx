"use client";

// OS 2.0 Section Editor — drag-and-drop page builder for the home page.
// Uses the HTML5 Drag and Drop API (no extra deps). Each block renders as a
// draggable row with a grip handle, expand/collapse settings, and a remove button.
// The "Add Section" palette lets the seller insert any block type.
//
// Parent (Customizer) owns the blocks state and passes onChange so every mutation
// auto-saves through the existing debounced save pipeline.

import { useCallback, useRef, useState } from "react";
import type {
  PageBlock,
  PageBlockType,
  HomePageBlocks,
} from "@/lib/theme/pageBuilder";
import { BLOCK_CATALOG, defaultSettings } from "@/lib/theme/pageBuilder";

interface PageBuilderControlsProps {
  blocks: HomePageBlocks;
  onChange: (next: HomePageBlocks) => void;
}

export function PageBuilderControls({ blocks, onChange }: PageBuilderControlsProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Drag-and-drop ────────────────────────────────────────────────────────
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  function handleDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx.current = idx;
  }

  function handleDrop() {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from === null || to === null || from === to) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onChange(next);
    dragIdx.current = null;
    dragOverIdx.current = null;
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  function addBlock(type: PageBlockType) {
    const id = crypto.randomUUID();
    const block = { id, type, settings: defaultSettings(type) } as PageBlock;
    onChange([...blocks, block] as HomePageBlocks);
    setExpandedId(id);
    setAddOpen(false);
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id) as HomePageBlocks);
    if (expandedId === id) setExpandedId(null);
  }

  function updateBlock(id: string, patch: Record<string, unknown>) {
    onChange(
      blocks.map((b) =>
        b.id === id
          ? ({ ...b, settings: { ...b.settings, ...patch } } as PageBlock)
          : b,
      ) as HomePageBlocks,
    );
  }

  const meta = (type: PageBlockType) => BLOCK_CATALOG.find((c) => c.type === type);

  return (
    <div className="flex flex-col gap-3">
      {/* Section list */}
      <ul className="flex flex-col gap-2" aria-label="পেজ সেকশন তালিকা">
        {blocks.map((block, idx) => {
          const m = meta(block.type);
          const isExpanded = expandedId === block.id;
          return (
            <li
              key={block.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={handleDrop}
              className="rounded-lg border border-border bg-surface shadow-sm"
            >
              {/* Block header row */}
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Drag handle */}
                <span
                  className="cursor-grab touch-none text-ink-muted select-none"
                  aria-hidden
                  title="টেনে সরান"
                >
                  ⠿
                </span>
                {/* Icon + label */}
                <span className="mr-1 text-base" aria-hidden>{m?.icon}</span>
                <span className="flex-1 text-sm font-medium text-ink">{m?.label ?? block.type}</span>
                {/* Expand/collapse */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : block.id)}
                  className="rounded p-1 text-xs text-ink-muted hover:bg-surface-2"
                  aria-expanded={isExpanded}
                  aria-label="সেটিংস"
                >
                  {isExpanded ? "▲" : "▼"}
                </button>
                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  className="rounded p-1 text-xs text-error hover:bg-error/10"
                  aria-label="সরিয়ে দিন"
                >
                  ✕
                </button>
              </div>

              {/* Settings panel */}
              {isExpanded && (
                <div className="border-t border-border px-3 py-3">
                  <BlockSettings block={block} onPatch={(p) => updateBlock(block.id, p)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {blocks.length === 0 && (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-ink-muted">
          এখনো কোনো ব্লক নেই — নিচের বোতাম থেকে সেকশন যোগ করুন।
        </p>
      )}

      {/* Add section button + palette */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="w-full rounded-lg border border-dashed border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          + সেকশন যোগ করুন
        </button>
        {addOpen && (
          <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
            <ul>
              {BLOCK_CATALOG.map((c) => (
                <li key={c.type}>
                  <button
                    type="button"
                    onClick={() => addBlock(c.type)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
                  >
                    <span className="mt-0.5 text-lg" aria-hidden>{c.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{c.label}</p>
                      <p className="text-xs text-ink-muted">{c.description}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-block settings form
// ---------------------------------------------------------------------------

interface SettingsProps {
  block: PageBlock;
  onPatch: (patch: Record<string, unknown>) => void;
}

function BlockSettings({ block, onPatch }: SettingsProps) {
  const s = block.settings as Record<string, unknown>;
  const field = useCallback(
    (key: string) => ({
      value: (s[key] ?? "") as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onPatch({ [key]: e.target.value }),
    }),
    [s, onPatch],
  );

  if (block.type === "hero") {
    return (
      <Fields>
        <TextField label="শিরোনাম" {...field("headline")} />
        <TextField label="সাবটাইটেল" {...field("subline")} />
        <TextField label="CTA লেখা" {...field("cta_text")} />
        <TextField label="CTA লিংক" {...field("cta_url")} type="url" />
        <TextField label="ব্যাকগ্রাউন্ড ছবি URL" {...field("image_url")} type="url" />
      </Fields>
    );
  }

  if (block.type === "announcement_bar") {
    return <Fields><TextField label="ঘোষণার লেখা" {...field("text")} /></Fields>;
  }

  if (block.type === "featured_products") {
    return (
      <Fields>
        <TextField label="শিরোনাম (ঐচ্ছিক)" {...field("heading")} />
        <NumberField
          label="পণ্যের সংখ্যা"
          value={Number(s["product_count"] ?? 8)}
          min={2} max={24}
          onChange={(v) => onPatch({ product_count: v })}
        />
      </Fields>
    );
  }

  if (block.type === "collections_grid") {
    return <Fields><TextField label="শিরোনাম (ঐচ্ছিক)" {...field("heading")} /></Fields>;
  }

  if (block.type === "trust_band") {
    return <p className="text-xs text-ink-muted">কোনো সেটিংস নেই — এটি স্বয়ংক্রিয়।</p>;
  }

  if (block.type === "image_text") {
    return (
      <Fields>
        <TextField label="শিরোনাম" {...field("heading")} />
        <TextAreaField label="বিবরণ" {...field("body")} />
        <TextField label="ছবি URL" {...field("image_url")} type="url" />
        <SelectField
          label="ছবির অবস্থান"
          value={String(s["image_side"] ?? "left")}
          options={[{ value: "left", label: "বাঁয়ে" }, { value: "right", label: "ডানে" }]}
          onChange={(v) => onPatch({ image_side: v })}
        />
        <TextField label="CTA লেখা (ঐচ্ছিক)" {...field("cta_text")} />
        <TextField label="CTA লিংক" {...field("cta_url")} type="url" />
      </Fields>
    );
  }

  if (block.type === "rich_text") {
    return <Fields><TextAreaField label="টেক্সট" {...field("content")} rows={5} /></Fields>;
  }

  if (block.type === "cta_banner") {
    return (
      <Fields>
        <TextField label="শিরোনাম" {...field("heading")} />
        <TextField label="বোতামের লেখা" {...field("button_text")} />
        <TextField label="বোতামের লিংক" {...field("button_url")} type="url" />
      </Fields>
    );
  }

  if (block.type === "spacer") {
    return (
      <NumberField
        label="উচ্চতা (rem)"
        value={Number(s["height_rem"] ?? 4)}
        min={1} max={20}
        onChange={(v) => onPatch({ height_rem: v })}
      />
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tiny field primitives
// ---------------------------------------------------------------------------

function Fields({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}

function TextField({ label, value, onChange, type = "text" }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      {label}
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
}

function TextAreaField({ label, value, onChange, rows = 3 }: TextAreaFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      {label}
      <textarea
        value={value}
        onChange={onChange}
        rows={rows}
        className="rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}
