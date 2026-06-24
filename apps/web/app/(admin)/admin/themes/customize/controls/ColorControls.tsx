"use client";

// রং (Colors) control group (DESIGN §Q1.3 #1). Five labelled swatch+hex inputs
// (primary/accent/background/surface/text) plus curated palette presets and a
// live AA contrast warning chip when text-on-background fails. No free-form CSS
// — each field is a constrained color input mapped 1:1 to the settings.colors
// keys.
import type { ThemeColors } from "@/lib/theme/schema";
import { passesAaContrast, contrastRatio } from "@/lib/theme/schema";

interface ColorControlsProps {
  colors: ThemeColors;
  onChange: (next: ThemeColors) => void;
}

const FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: "primary", label: "প্রাইমারি (বাটন)" },
  { key: "accent", label: "অ্যাকসেন্ট (সেল ট্যাগ)" },
  { key: "background", label: "ব্যাকগ্রাউন্ড" },
  { key: "surface", label: "কার্ড/সারফেস" },
  { key: "text", label: "লেখার রং" },
];

const PRESETS: { name: string; colors: ThemeColors }[] = [
  {
    name: "দরজা ক্লাসিক",
    colors: {
      primary: "#1D4ED8",
      accent: "#F59E0B",
      background: "#FBFAF8",
      surface: "#FFFFFF",
      text: "#1C1917",
    },
  },
  {
    name: "সবুজ",
    colors: {
      primary: "#047857",
      accent: "#F59E0B",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      text: "#0F172A",
    },
  },
  {
    name: "নীল-সোনা",
    colors: {
      primary: "#1E3A8A",
      accent: "#D4AF37",
      background: "#FFFFFF",
      surface: "#F8FAFC",
      text: "#111827",
    },
  },
];

export function ColorControls({ colors, onChange }: ColorControlsProps) {
  const contrastOk = passesAaContrast(colors.text, colors.background);
  const ratio = contrastRatio(colors.text, colors.background).toFixed(1);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">প্রিসেট</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
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
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <input
              type="color"
              value={colors[f.key]}
              onChange={(e) => onChange({ ...colors, [f.key]: e.target.value.toUpperCase() })}
              aria-label={f.label}
              className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-0.5"
            />
            <div className="min-w-0 flex-1">
              <label className="block text-sm font-medium text-ink">{f.label}</label>
              <input
                type="text"
                value={colors[f.key]}
                onChange={(e) => onChange({ ...colors, [f.key]: e.target.value })}
                spellCheck={false}
                className="mt-0.5 w-28 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs uppercase text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
        ))}
      </div>

      {!contrastOk && (
        <p className="rounded-md bg-st-pending-weak px-3 py-2 text-xs font-medium text-st-pending">
          ⚠ লেখা ও ব্যাকগ্রাউন্ডের কনট্রাস্ট কম ({ratio}:১) — পড়তে কষ্ট হতে পারে।
        </p>
      )}
    </div>
  );
}
