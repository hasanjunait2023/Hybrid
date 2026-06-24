"use client";

// ফন্ট (Typography) control group (DESIGN §Q1.3 #2). headingFont + bodyFont,
// each a radio list of the pre-approved fonts with a live "আপনার দোকান" sample.
// No upload, no URL — the radio set IS the allowlist (FONT_CHOICES).
import { FONT_CHOICES, type ThemeTypography, type FontChoice } from "@/lib/theme/schema";

interface TypographyControlsProps {
  typography: ThemeTypography;
  onChange: (next: ThemeTypography) => void;
}

export function TypographyControls({ typography, onChange }: TypographyControlsProps) {
  return (
    <div className="space-y-5">
      <FontRadioGroup
        legend="হেডিং ফন্ট"
        name="headingFont"
        value={typography.headingFont}
        onChange={(f) => onChange({ ...typography, headingFont: f })}
      />
      <FontRadioGroup
        legend="বডি ফন্ট"
        name="bodyFont"
        value={typography.bodyFont}
        onChange={(f) => onChange({ ...typography, bodyFont: f })}
      />
    </div>
  );
}

function FontRadioGroup({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  value: FontChoice;
  onChange: (f: FontChoice) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{legend}</legend>
      <div className="space-y-2">
        {FONT_CHOICES.map((font) => {
          const selected = font === value;
          return (
            <label
              key={font}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                selected ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={selected}
                onChange={() => onChange(font)}
                className="h-4 w-4 accent-primary"
              />
              <span className="flex-1">
                <span className="block text-xs text-ink-muted">{font}</span>
                <span
                  className="bn-heading block text-lg text-ink"
                  style={{ fontFamily: `"${font}", var(--font-bangla)` }}
                >
                  আপনার দোকান
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
