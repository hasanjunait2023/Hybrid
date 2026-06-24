"use client";

// সেকশন (Sections) control group (DESIGN §Q1.3 #4). The FIXED home-section list
// rendered as <SectionToggleRow>s — toggle + up/down reorder, NEVER a drag
// handle (the scope guard lives inside SectionToggleRow). trust_band carries a
// soft warning when disabled (trust signals are load-bearing in this market).
import { SectionToggleRow } from "@hybrid/ui";
import type { ThemeSection, SectionType } from "@/lib/theme/schema";

interface SectionControlsProps {
  sections: ThemeSection[];
  onChange: (next: ThemeSection[]) => void;
}

const SECTION_LABELS: Record<SectionType, string> = {
  announcement_bar: "ঘোষণা বার",
  hero: "হিরো ব্যানার",
  featured_products: "ফিচার্ড পণ্য",
  collections_grid: "কালেকশন গ্রিড",
  trust_band: "ট্রাস্ট সেকশন (COD)",
};

const TRUST_WARNING = "COD ট্রাস্ট সেকশন বন্ধ করলে বিশ্বাসযোগ্যতা কমে।";

export function SectionControls({ sections, onChange }: SectionControlsProps) {
  // Always render in current position order; reorder swaps positions.
  const ordered = [...sections].sort((a, b) => a.position - b.position);

  function setEnabled(type: SectionType, enabled: boolean) {
    onChange(sections.map((s) => (s.type === type ? { ...s, enabled } : s)));
  }

  function move(type: SectionType, dir: -1 | 1) {
    const idx = ordered.findIndex((s) => s.type === type);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    const next = [...ordered];
    // Both indices are bounds-checked above (idx from findIndex, swapIdx guarded).
    const tmp = next[idx]!;
    next[idx] = next[swapIdx]!;
    next[swapIdx] = tmp;
    // Re-number positions 0..n to keep them dense and valid.
    onChange(next.map((s, i) => ({ ...s, position: i })));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-subtle">
        সেকশন চালু/বন্ধ করুন আর ক্রম বদলান। নতুন সেকশন যোগ করা যায় না।
      </p>
      {ordered.map((section, i) => (
        <SectionToggleRow
          key={section.type}
          label={SECTION_LABELS[section.type]}
          enabled={section.enabled}
          isFirst={i === 0}
          isLast={i === ordered.length - 1}
          warning={section.type === "trust_band" ? TRUST_WARNING : undefined}
          onToggle={(enabled) => setEnabled(section.type, enabled)}
          onMoveUp={() => move(section.type, -1)}
          onMoveDown={() => move(section.type, 1)}
        />
      ))}
    </div>
  );
}
