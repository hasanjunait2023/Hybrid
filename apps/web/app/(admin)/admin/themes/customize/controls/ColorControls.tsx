"use client";

// রং (Colors) control group (DESIGN §Q1.3 #1). Five labelled swatch+hex inputs
// (primary/accent/background/surface/text) plus curated palette presets and a
// live AA contrast warning chip when text-on-background fails. No free-form CSS
// — each field is a constrained color input mapped 1:1 to the settings.colors
// keys.
import type { ThemeColors } from "@/lib/theme/schema";
import { passesAaContrast, contrastRatio } from "@/lib/theme/schema";
import { useDict } from "@/lib/i18n/provider";
import { COLOR_PRESETS } from "../../palettes";

interface ColorControlsProps {
  colors: ThemeColors;
  onChange: (next: ThemeColors) => void;
}

const FIELD_KEYS: (keyof ThemeColors)[] = [
  "primary",
  "accent",
  "background",
  "surface",
  "text",
];

const PRESETS = COLOR_PRESETS;

export function ColorControls({ colors, onChange }: ColorControlsProps) {
  const t = useDict().admin.themes;
  const contrastOk = passesAaContrast(colors.text, colors.background);
  const ratio = contrastRatio(colors.text, colors.background).toFixed(1);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">{t.colors.presetLabel}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.colors)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm font-medium text-ink hover:bg-surface-2"
            >
              <span className="flex">
                <span
                  className="h-4 w-4 rounded-l-full"
                  style={{ background: p.colors.primary }}
                />
                <span
                  className="h-4 w-4 rounded-r-full"
                  style={{ background: p.colors.accent }}
                />
              </span>
              {t.colors.presets[p.key]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {FIELD_KEYS.map((key) => {
          const label = t.colors.fields[key];
          return (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={colors[key]}
                onChange={(e) => onChange({ ...colors, [key]: e.target.value.toUpperCase() })}
                aria-label={label}
                className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-0.5"
              />
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-medium text-ink">{label}</label>
                <input
                  type="text"
                  value={colors[key]}
                  onChange={(e) => onChange({ ...colors, [key]: e.target.value })}
                  spellCheck={false}
                  className="mt-0.5 w-28 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs uppercase text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          );
        })}
      </div>

      {!contrastOk && (
        <p className="rounded-md bg-st-pending-weak px-3 py-2 text-xs font-medium text-st-pending">
          {t.colors.contrastWarning.replace("{ratio}", ratio)}
        </p>
      )}
    </div>
  );
}
