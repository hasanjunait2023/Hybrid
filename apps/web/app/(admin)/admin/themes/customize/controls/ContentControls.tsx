"use client";

// কন্টেন্ট (Content) control group (DESIGN §Q1.3 #3). storeName, logo URL, hero
// fields, and a single featured-collection select. Fixed fields only — no
// image-anywhere placement, no arbitrary blocks. Logo/hero image are entered as
// URLs here (the §P4 upload tile reuses /api/admin/upload and writes the URL
// back; this slice keeps the field URL-based and Zod-guards the scheme).
import type { ThemeContent } from "@/lib/theme/schema";

interface CollectionOption {
  id: string;
  title: string;
}

interface ContentControlsProps {
  content: ThemeContent;
  collections: CollectionOption[];
  onChange: (next: ThemeContent) => void;
}

export function ContentControls({ content, collections, onChange }: ContentControlsProps) {
  const headlineLeft = 120 - content.heroHeadline.length;

  return (
    <div className="space-y-4">
      <Field
        label="দোকানের নাম"
        value={content.storeName}
        onChange={(v) => onChange({ ...content, storeName: v })}
        maxLength={120}
      />
      <Field
        label="লোগো URL"
        value={content.logoUrl}
        onChange={(v) => onChange({ ...content, logoUrl: v })}
        placeholder="https://…"
        mono
      />

      <div className="border-t border-border pt-3">
        <p className="mb-2 text-sm font-semibold text-ink">হিরো সেকশন</p>
        <Field
          label="হেডলাইন"
          value={content.heroHeadline}
          onChange={(v) => onChange({ ...content, heroHeadline: v.slice(0, 120) })}
          maxLength={120}
          hint={`${headlineLeft} অক্ষর বাকি`}
        />
        <Field
          label="সাবলাইন"
          value={content.heroSubline}
          onChange={(v) => onChange({ ...content, heroSubline: v })}
          maxLength={200}
        />
        <Field
          label="বাটনের লেখা"
          value={content.heroCta}
          onChange={(v) => onChange({ ...content, heroCta: v })}
          maxLength={40}
        />
        <Field
          label="হিরো ছবির URL"
          value={content.heroImageUrl}
          onChange={(v) => onChange({ ...content, heroImageUrl: v })}
          placeholder="https://…"
          mono
        />
      </div>

      <div className="border-t border-border pt-3">
        <label className="block text-sm font-medium text-ink">ফিচার্ড কালেকশন</label>
        <select
          value={content.featuredCollectionId ?? ""}
          onChange={(e) =>
            onChange({
              ...content,
              featuredCollectionId: e.target.value === "" ? null : e.target.value,
            })
          }
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">— কোনোটি নয় —</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  hint,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-ink">{label}</label>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
      {hint && <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}
